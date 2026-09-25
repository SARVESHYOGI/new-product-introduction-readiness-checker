import type {
  Prisma,
  PrismaClient,
  InventoryItem,
  IdentifierRange,
  ProductInventoryMapping,
} from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AdvisoryConflict } from "@/modules/operators/service";
import type {
  IdentifierRangeCreateInput,
  IdentifierRangeUpdateInput,
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  InventoryMappingCreateInput,
  InventoryMappingUpdateInput,
} from "@/lib/validation/schemas";

export interface WriteResult<T> {
  entity: T;
  /** Advisory only — the readiness engine remains the authority on readiness. */
  conflicts: AdvisoryConflict[];
}

export class InventoryService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  // ------------------------------------------------------------------ items

  async listItems(options: { productId?: string } = {}) {
    return this.client.inventoryItem.findMany({
      where: options.productId
        ? { productMappings: { some: { productId: options.productId } } }
        : {},
      include: {
        productMappings: {
          include: { product: { select: { id: true, sku: true, name: true } } },
        },
      },
      orderBy: { sku: "asc" },
    });
  }

  async createItem(
    input: InventoryItemCreateInput,
    actorId: string
  ): Promise<WriteResult<InventoryItem>> {
    return withMappedErrors("inventory item", async () =>
      this.client.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: { sku: input.sku, name: input.name, status: input.status },
        });
        await recordAudit(tx, {
          actorId,
          action: "inventory_item.create",
          entityType: "InventoryItem",
          entityId: item.id,
          metadata: { sku: item.sku, status: item.status },
        });
        return { entity: item, conflicts: [] };
      })
    );
  }

  /**
   * Inventory items are shared master data and are never deleted — a mapped SKU
   * that disappeared would turn every product using it into an unresolvable
   * reference. Deactivation is the lifecycle operation, and the advisory tells
   * the engineer which readiness checks will start failing as a result.
   */
  async updateItem(
    id: string,
    input: InventoryItemUpdateInput,
    actorId: string
  ): Promise<WriteResult<InventoryItem>> {
    return withMappedErrors("inventory item", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.inventoryItem.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Inventory item ${id} was not found.`);
        }

        const conflicts: AdvisoryConflict[] = [];
        const nextStatus = input.status ?? existing.status;
        if (existing.status === "ACTIVE" && nextStatus === "INACTIVE") {
          const mappings = await tx.productInventoryMapping.findMany({
            where: { inventoryItemId: id, status: "ACTIVE" },
            select: { product: { select: { name: true, sku: true } } },
          });
          for (const m of mappings) {
            conflicts.push({
              code: "ITEM_NOT_ACTIVE",
              message: `${m.product.name} (${m.product.sku}) maps to this item. Its next readiness check will fail Rule 5 (Inventory Mapping) until another active item is mapped.`,
            });
          }
        }

        const item = await tx.inventoryItem.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "inventory_item.update",
          entityType: "InventoryItem",
          entityId: item.id,
          metadata: { from: { name: existing.name, status: existing.status }, to: input },
        });
        return { entity: item, conflicts };
      })
    );
  }

  // ---------------------------------------------------------------- mappings

  async listMappings(productId: string): Promise<ProductInventoryMapping[]> {
    return this.client.productInventoryMapping.findMany({
      where: { productId },
      include: { inventoryItem: true },
      orderBy: { id: "asc" },
    });
  }

  /**
   * Map a finished-goods inventory item to a product.
   *
   * A product may only have one *active* output mapping, but inactive mappings
   * are kept as history, so the invariant is reported as an advisory here and
   * enforced by the readiness engine (Rule 5) — the editor must be able to
   * record the state an engineer is trying to fix, not forbid it.
   */
  async createMapping(
    productId: string,
    input: InventoryMappingCreateInput,
    actorId: string
  ): Promise<WriteResult<ProductInventoryMapping>> {
    return withMappedErrors("inventory mapping", async () =>
      this.client.$transaction(async (tx) => {
        const [product, item] = await Promise.all([
          tx.product.findUnique({ where: { id: productId } }),
          tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId } }),
        ]);
        if (!product) {
          throw ApiError.notFound("NOT_FOUND", `Product ${productId} was not found.`);
        }
        if (!item) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Inventory item ${input.inventoryItemId} was not found.`
          );
        }

        const conflicts: AdvisoryConflict[] = mappingAdvisories({ product, item });

        if (input.status === "ACTIVE") {
          const otherActive = await tx.productInventoryMapping.count({
            where: { productId, mappingType: "OUTPUT", status: "ACTIVE" },
          });
          if (otherActive > 0) {
            conflicts.push({
              code: "MULTIPLE_ACTIVE_MAPPINGS",
              message: `This product already has ${otherActive} active output inventory mapping(s). The readiness engine blocks production unless exactly one is active.`,
            });
          }
        }

        const mapping = await tx.productInventoryMapping.create({
          data: { productId, inventoryItemId: item.id, mappingType: "OUTPUT", status: input.status },
        });

        await recordAudit(tx, {
          actorId,
          action: "inventory_mapping.create",
          entityType: "ProductInventoryMapping",
          entityId: mapping.id,
          metadata: { productId, inventorySku: item.sku, status: mapping.status },
        });

        return { entity: mapping, conflicts };
      })
    );
  }

  /**
   * Repoint a mapping at a different finished goods item.
   *
   * This is the primary way a product changes its stock location, so it performs
   * exactly the same validation as `createMapping` — the earlier version skipped
   * it and produced invalid mappings that only surfaced at the next readiness
   * check. The previous item id is recorded in the audit log so the repoint
   * stays traceable even though the row is updated in place.
   */
  async updateMapping(
    productId: string,
    mappingId: string,
    input: InventoryMappingUpdateInput,
    actorId: string
  ): Promise<WriteResult<ProductInventoryMapping>> {
    return withMappedErrors("inventory mapping", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.productInventoryMapping.findUnique({
          where: { id: mappingId },
          include: { inventoryItem: { select: { sku: true } } },
        });
        if (!existing || existing.productId !== productId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Inventory mapping ${mappingId} was not found on this product.`
          );
        }

        const conflicts: AdvisoryConflict[] = [];
        let itemSku = existing.inventoryItem.sku;

        if (input.inventoryItemId !== undefined && input.inventoryItemId !== existing.inventoryItemId) {
          const item = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
          if (!item) {
            throw ApiError.notFound(
              "NOT_FOUND",
              `Inventory item ${input.inventoryItemId} was not found.`
            );
          }
          const product = await tx.product.findUnique({ where: { id: productId } });
          conflicts.push(...mappingAdvisories({ product, item }));
          itemSku = item.sku;
        }

        const resultingStatus = input.status ?? existing.status;
        if (resultingStatus === "ACTIVE") {
          const otherActive = await tx.productInventoryMapping.count({
            where: {
              productId,
              mappingType: existing.mappingType,
              status: "ACTIVE",
              id: { not: mappingId },
            },
          });
          if (otherActive > 0) {
            conflicts.push({
              code: "MULTIPLE_ACTIVE_MAPPINGS",
              message: `This would leave ${otherActive + 1} active output inventory mappings for the product. The readiness engine blocks production unless exactly one is active.`,
            });
          }
        }

        const mapping = await tx.productInventoryMapping.update({
          where: { id: mappingId },
          data: {
            ...(input.inventoryItemId !== undefined
              ? { inventoryItemId: input.inventoryItemId }
              : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "inventory_mapping.update",
          entityType: "ProductInventoryMapping",
          entityId: mapping.id,
          metadata: {
            from: { status: existing.status, inventorySku: existing.inventoryItem.sku },
            to: { status: mapping.status, inventorySku: itemSku },
          },
        });
        return { entity: mapping, conflicts };
      })
    );
  }

  /**
   * Remove a mapping. Deleting the product's only *active* mapping is a legal
   * edit (Rule 5 will then fail loudly on the next check), so it is reported as
   * an advisory rather than refused.
   */
  async removeMapping(
    productId: string,
    mappingId: string,
    actorId: string
  ): Promise<{ conflicts: AdvisoryConflict[] }> {
    return withMappedErrors("inventory mapping", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.productInventoryMapping.findUnique({
          where: { id: mappingId },
          include: { inventoryItem: { select: { sku: true } } },
        });
        if (!existing || existing.productId !== productId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Inventory mapping ${mappingId} was not found on this product.`
          );
        }

        const conflicts: AdvisoryConflict[] = [];
        if (existing.status === "ACTIVE") {
          const remaining = await tx.productInventoryMapping.count({
            where: { productId, mappingType: existing.mappingType, status: "ACTIVE", id: { not: mappingId } },
          });
          if (remaining === 0) {
            conflicts.push({
              code: "NO_ACTIVE_OUTPUT_MAPPING",
              message: `The product no longer has an active output inventory mapping, so Rule 5 (Inventory Mapping) will fail until one is created.`,
            });
          }
        }

        await tx.productInventoryMapping.delete({ where: { id: mappingId } });
        await recordAudit(tx, {
          actorId,
          action: "inventory_mapping.delete",
          entityType: "ProductInventoryMapping",
          entityId: mappingId,
          metadata: { productId, inventorySku: existing.inventoryItem.sku },
        });

        return { conflicts };
      })
    );
  }

  // -------------------------------------------------------- identifier ranges

  /**
   * Serial ranges for one product. The select mirrors the client DTO exactly —
   * the editor does not need the parent product on every row, and shipping
   * undeclared fields invites the client types to drift from the API.
   */
  async listRanges(productId: string) {
    return this.client.identifierRange.findMany({
      where: { productId },
      select: {
        id: true,
        productId: true,
        prefix: true,
        startNumber: true,
        endNumber: true,
        currentNumber: true,
        status: true,
      },
      orderBy: [{ status: "asc" }, { startNumber: "asc" }],
    });
  }

  /** A single range, scoped to the product in the path. */
  async getRange(productId: string, rangeId: string) {
    const range = await this.client.identifierRange.findFirst({
      where: { id: rangeId, productId },
      select: {
        id: true,
        productId: true,
        prefix: true,
        startNumber: true,
        endNumber: true,
        currentNumber: true,
        status: true,
      },
    });
    if (!range) {
      throw ApiError.notFound(
        "NOT_FOUND",
        `Identifier range ${rangeId} was not found on this product.`
      );
    }
    return range;
  }

  async createRange(
    productId: string,
    input: IdentifierRangeCreateInput,
    actorId: string
  ): Promise<WriteResult<IdentifierRange>> {
    return withMappedErrors("identifier range", async () =>
      this.client.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw ApiError.notFound("NOT_FOUND", `Product ${productId} was not found.`);
        }

        assertRangeGeometry(input.startNumber, input.endNumber, input.currentNumber);

        const conflicts =
          input.status === "ACTIVE"
            ? await findRangeConflicts(tx, {
                productId,
                prefix: input.prefix,
                startNumber: input.startNumber,
                endNumber: input.endNumber,
              })
            : [];

        const range = await tx.identifierRange.create({
          data: {
            productId,
            prefix: input.prefix,
            startNumber: input.startNumber,
            endNumber: input.endNumber,
            currentNumber: input.currentNumber,
            status: input.status,
          },
        });

        await recordAudit(tx, {
          actorId,
          action: "identifier_range.create",
          entityType: "IdentifierRange",
          entityId: range.id,
          metadata: {
            productId,
            prefix: range.prefix,
            start: range.startNumber,
            end: range.endNumber,
            status: range.status,
          },
        });

        return { entity: range, conflicts };
      })
    );
  }

  async updateRange(
    productId: string,
    rangeId: string,
    input: IdentifierRangeUpdateInput,
    actorId: string
  ): Promise<WriteResult<IdentifierRange>> {
    return withMappedErrors("identifier range", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.identifierRange.findFirst({ where: { id: rangeId, productId } });
        if (!existing) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Identifier range ${rangeId} was not found on this product.`
          );
        }

        const start = input.startNumber ?? existing.startNumber;
        const end = input.endNumber ?? existing.endNumber;
        const current = input.currentNumber ?? existing.currentNumber;
        const nextStatus = input.status ?? existing.status;
        const prefix = input.prefix ?? existing.prefix;

        assertRangeGeometry(start, end, current);

        // The counter is the last issued serial. Moving it backwards re-issues
        // numbers that have already left the building, and nothing downstream
        // could detect that, so it is refused outright — allocate a new range
        // instead.
        if (current < existing.currentNumber) {
          throw ApiError.conflict(
            "RANGE_COUNTER_REGRESSION",
            `The current number cannot be moved back from ${existing.currentNumber} to ${current}; those serials have already been issued. Create a new identifier range instead.`
          );
        }

        // Any change to an active range's geometry can introduce an overlap, and
        // widening an already-active range is the most common way to do it — so
        // the check runs on the resulting state, not only on activation.
        const geometryChanged =
          start !== existing.startNumber || end !== existing.endNumber || prefix !== existing.prefix;
        const conflicts =
          nextStatus === "ACTIVE" && (geometryChanged || nextStatus !== existing.status)
            ? await findRangeConflicts(tx, {
                productId,
                excludeRangeId: rangeId,
                prefix,
                startNumber: start,
                endNumber: end,
              })
            : [];

        const range = await tx.identifierRange.update({
          where: { id: rangeId },
          data: {
            ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
            ...(input.startNumber !== undefined ? { startNumber: input.startNumber } : {}),
            ...(input.endNumber !== undefined ? { endNumber: input.endNumber } : {}),
            ...(input.currentNumber !== undefined ? { currentNumber: input.currentNumber } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });

        await recordAudit(tx, {
          actorId,
          action: "identifier_range.update",
          entityType: "IdentifierRange",
          entityId: range.id,
          metadata: {
            from: {
              start: existing.startNumber,
              end: existing.endNumber,
              current: existing.currentNumber,
              status: existing.status,
            },
            to: {
              start: range.startNumber,
              end: range.endNumber,
              current: range.currentNumber,
              status: range.status,
            },
          },
        });

        return { entity: range, conflicts };
      })
    );
  }

  async removeRange(productId: string, rangeId: string, actorId: string): Promise<void> {
    return withMappedErrors("identifier range", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.identifierRange.findFirst({ where: { id: rangeId, productId } });
        if (!existing) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Identifier range ${rangeId} was not found on this product.`
          );
        }
        await tx.identifierRange.delete({ where: { id: rangeId } });
        await recordAudit(tx, {
          actorId,
          action: "identifier_range.delete",
          entityType: "IdentifierRange",
          entityId: rangeId,
          metadata: {
            productId,
            prefix: existing.prefix,
            start: existing.startNumber,
            end: existing.endNumber,
            lastIssued: existing.currentNumber,
          },
        });
      })
    );
  }
}

/**
 * Serial geometry is validated at the boundary so the readiness engine never
 * has to explain a nonsense range to a user: the counter must sit inside the
 * block it is drawn from, and the block must be non-empty.
 */
function assertRangeGeometry(start: number, end: number, current: number): void {
  if (start >= end) {
    throw ApiError.badRequest(
      "INVALID_RANGE",
      "The range start must be lower than the range end."
    );
  }
  if (current < start || current > end) {
    throw ApiError.badRequest(
      "CURRENT_NUMBER_OUT_OF_RANGE",
      `The current number (${current}) must sit between the start (${start}) and the end (${end}) of the range.`
    );
  }
}

/**
 * Advisories shared by the create and update mapping paths.
 *
 * Neither condition is rejected at write time: an engineer may legitimately
 * need to record the mapping before the stock item is activated or renamed. The
 * readiness engine reports both as failures, so the warning is informational
 * rather than a second, divergent definition of "ready".
 */
function mappingAdvisories(args: {
  product: { sku: string } | null;
  item: { sku: string; status: string };
}): AdvisoryConflict[] {
  const conflicts: AdvisoryConflict[] = [];
  if (args.item.status !== "ACTIVE") {
    conflicts.push({
      code: "ITEM_NOT_ACTIVE",
      message: `${args.item.sku} is ${args.item.status}. A readiness check will fail Rule 5 (Inventory Mapping) while the item is not ACTIVE.`,
    });
  }
  if (args.product && args.item.sku !== args.product.sku) {
    conflicts.push({
      code: "SKU_MISMATCH",
      message: `The inventory SKU (${args.item.sku}) does not match the product SKU (${args.product.sku}). A readiness check will report this as a mapping mismatch.`,
    });
  }
  return conflicts;
}

/**
 * Overlapping serial ranges are the identifier-safety check (Rule 4). The
 * editor reports the overlap rather than silently refusing it, because a plant
 * may legitimately need to record a bad range before engineering resolves it —
 * and the readiness engine is what actually blocks production.
 */
async function findRangeConflicts(
  tx: Prisma.TransactionClient,
  args: {
    productId: string;
    excludeRangeId?: string;
    prefix: string;
    startNumber: number;
    endNumber: number;
  }
): Promise<AdvisoryConflict[]> {
  const conflicts: AdvisoryConflict[] = [];

  const others = await tx.identifierRange.findMany({
    where: {
      productId: args.productId,
      status: "ACTIVE",
      ...(args.excludeRangeId ? { id: { not: args.excludeRangeId } } : {}),
    },
    select: { id: true, prefix: true, startNumber: true, endNumber: true },
  });

  for (const other of others) {
    const overlaps = args.startNumber <= other.endNumber && other.startNumber <= args.endNumber;
    if (overlaps) {
      conflicts.push({
        code: "OVERLAPPING_IDENTIFIER_RANGES",
        message: `${other.prefix} already has an active range ${other.startNumber}–${other.endNumber} that overlaps ${args.prefix} ${args.startNumber}–${args.endNumber}. Overlapping active ranges are a blocking failure in Rule 4 (Identifier Range).`,
      });
    }
  }

  return conflicts;
}
