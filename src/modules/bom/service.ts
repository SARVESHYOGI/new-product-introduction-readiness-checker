import type { PrismaClient, BOMVersion, Prisma } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { assertVersionTransition } from "@/lib/version-lifecycle";
import type { AdvisoryConflict } from "@/modules/operators/service";
import type {
  BomItemCreateInput,
  BomItemUpdateInput,
  BomVersionCreateInput,
  BomVersionUpdateInput,
} from "@/lib/validation/schemas";

export type BomListItem = Pick<
  BOMVersion,
  "id" | "version" | "status" | "effectiveFrom" | "effectiveTo" | "createdAt"
> & { itemCount: number };

export interface BomWriteResult<T> {
  entity: T;
  /** Advisory only — the readiness engine remains the authority on readiness. */
  conflicts: AdvisoryConflict[];
}

export class BomService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  async listByProduct(productId: string): Promise<BomListItem[]> {
    const boms = await this.client.bOMVersion.findMany({
      where: { productId },
      include: { _count: { select: { items: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return boms.map((b) => ({
      id: b.id,
      version: b.version,
      status: b.status,
      effectiveFrom: b.effectiveFrom,
      effectiveTo: b.effectiveTo,
      createdAt: b.createdAt,
      itemCount: b._count.items,
    }));
  }

  async getById(id: string) {
    return this.client.bOMVersion.findUnique({
      where: { id },
      include: {
        items: { orderBy: { componentName: "asc" } },
        product: { select: { id: true, sku: true, name: true } },
      },
    });
  }

  /**
   * Create a BOM version. Defaults to DRAFT so a half-built BOM can never be
   * picked up by a readiness check by accident — activation is a separate,
   * deliberate act.
   */
  async create(
    productId: string,
    input: BomVersionCreateInput,
    actorId: string
  ): Promise<BomWriteResult<BOMVersion>> {
    return withMappedErrors("BOM version", async () =>
      this.client.$transaction(async (tx) => {
        await assertProductExists(tx, productId);
        assertEffectiveWindow(input.effectiveFrom, input.effectiveTo);

        const bom = await tx.bOMVersion.create({
          data: {
            productId,
            version: input.version,
            status: input.status,
            effectiveFrom: input.effectiveFrom ?? null,
            effectiveTo: input.effectiveTo ?? null,
          },
        });

        const conflicts =
          input.status === "ACTIVE"
            ? await findActiveBomConflicts(tx, productId, bom.id)
            : [];

        await recordAudit(tx, {
          actorId,
          action: "bom.create",
          entityType: "BOMVersion",
          entityId: bom.id,
          metadata: { productId, version: bom.version, status: bom.status },
        });

        return { entity: bom, conflicts };
      })
    );
  }

  async update(
    id: string,
    input: BomVersionUpdateInput,
    actorId: string
  ): Promise<BomWriteResult<BOMVersion>> {
    return withMappedErrors("BOM version", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.bOMVersion.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `BOM version ${id} was not found.`);
        }

        // Lifecycle policy shared with routings and work instructions:
        // ACTIVE → DRAFT and any transition out of OBSOLETE are rejected.
        const nextStatus = input.status ?? existing.status;
        assertVersionTransition(existing.status, nextStatus, "BOM version");

        const effectiveFrom =
          input.effectiveFrom === undefined ? existing.effectiveFrom : input.effectiveFrom;
        const effectiveTo =
          input.effectiveTo === undefined ? existing.effectiveTo : input.effectiveTo;
        assertEffectiveWindow(effectiveFrom, effectiveTo);

        // The effective window, like work-instruction content, is part of the
        // published contract: once a version is ACTIVE or OBSOLETE the window
        // is frozen (a no-op re-save is still permitted). Moving a window on a
        // published BOM would silently change what a product was validated
        // against, so it must go through a new version instead.
        const windowChanged =
          (input.effectiveFrom !== undefined &&
            !sameInstant(input.effectiveFrom, existing.effectiveFrom)) ||
          (input.effectiveTo !== undefined && !sameInstant(input.effectiveTo, existing.effectiveTo));

        if (windowChanged && (existing.status === "ACTIVE" || existing.status === "OBSOLETE")) {
          throw ApiError.conflict(
            "PUBLISHED_BOM_IMMUTABLE",
            "A published BOM version's effective window is frozen. Supersede this version and create a new one if the window must change."
          );
        }

        const bom = await tx.bOMVersion.update({
          where: { id },
          data: {
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
            ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
          },
        });

        // Activating while another version is already ACTIVE is allowed but
        // reported: two active BOMs is Safety Rule 3 (duplicate active
        // configuration) and the engineer should know before the check runs.
        const conflicts =
          nextStatus === "ACTIVE" && existing.status !== "ACTIVE"
            ? await findActiveBomConflicts(tx, existing.productId, id)
            : [];

        await recordAudit(tx, {
          actorId,
          action:
            input.status !== undefined && input.status !== existing.status
              ? "bom.status_change"
              : "bom.update",
          entityType: "BOMVersion",
          entityId: bom.id,
          metadata: { from: { status: existing.status }, to: input },
        });

        return { entity: bom, conflicts };
      })
    );
  }

  /**
   * A BOM version is never deleted. It is superseded (OBSOLETE) so historical
   * readiness checks — which reference it with `onDelete: Restrict` — remain
   * readable forever.
   */
  async obsolete(id: string, actorId: string): Promise<BomWriteResult<BOMVersion>> {
    return this.update(id, { status: "OBSOLETE" }, actorId);
  }

  async addItem(
    bomVersionId: string,
    input: BomItemCreateInput,
    actorId: string
  ): Promise<BomWriteResult<unknown>> {
    return withMappedErrors("BOM item", async () =>
      this.client.$transaction(async (tx) => {
        const bom = await assertBomExists(tx, bomVersionId);
        assertBomMutable(bom);
        const item = await tx.bOMItem.create({
          data: {
            bomVersionId,
            componentSku: input.componentSku,
            componentName: input.componentName,
            quantity: input.quantity,
            unit: input.unit,
            isRequired: input.isRequired,
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "bom_item.create",
          entityType: "BOMItem",
          entityId: item.id,
          metadata: {
            bomVersionId,
            bomVersion: bom.version,
            componentSku: item.componentSku,
            quantity: item.quantity.toString(),
            unit: item.unit,
          },
        });
        return { entity: item, conflicts: [] };
      })
    );
  }

  async updateItem(
    bomVersionId: string,
    itemId: string,
    input: BomItemUpdateInput,
    actorId: string
  ): Promise<BomWriteResult<unknown>> {
    return withMappedErrors("BOM item", async () =>
      this.client.$transaction(async (tx) => {
        const bom = await assertBomExists(tx, bomVersionId);
        assertBomMutable(bom);
        const existing = await tx.bOMItem.findUnique({ where: { id: itemId } });
        if (!existing || existing.bomVersionId !== bomVersionId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `BOM item ${itemId} was not found on this BOM version.`
          );
        }
        const item = await tx.bOMItem.update({
          where: { id: itemId },
          data: {
            ...(input.componentName !== undefined ? { componentName: input.componentName } : {}),
            ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
            ...(input.unit !== undefined ? { unit: input.unit } : {}),
            ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "bom_item.update",
          entityType: "BOMItem",
          entityId: item.id,
          metadata: { bomVersionId, from: { quantity: existing.quantity.toString() }, to: input },
        });
        return { entity: item, conflicts: [] };
      })
    );
  }

  /**
   * BOM items are children with no independent audit history, so they can be
   * removed outright. Removing one is still audited.
   */
  async removeItem(bomVersionId: string, itemId: string, actorId: string): Promise<void> {
    return withMappedErrors("BOM item", async () =>
      this.client.$transaction(async (tx) => {
        const bom = await assertBomExists(tx, bomVersionId);
        assertBomMutable(bom);
        const existing = await tx.bOMItem.findUnique({ where: { id: itemId } });
        if (!existing || existing.bomVersionId !== bomVersionId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `BOM item ${itemId} was not found on this BOM version.`
          );
        }
        await tx.bOMItem.delete({ where: { id: itemId } });
        await recordAudit(tx, {
          actorId,
          action: "bom_item.delete",
          entityType: "BOMItem",
          entityId: itemId,
          metadata: { bomVersionId, componentSku: existing.componentSku },
        });
      })
    );
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function assertProductExists(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw ApiError.notFound("NOT_FOUND", `Product ${productId} was not found.`);
  }
}

async function assertBomExists(
  tx: Prisma.TransactionClient,
  bomVersionId: string
): Promise<{ id: string; version: string; status: BOMVersion["status"] }> {
  const bom = await tx.bOMVersion.findUnique({ where: { id: bomVersionId } });
  if (!bom) {
    throw ApiError.notFound("NOT_FOUND", `BOM version ${bomVersionId} was not found.`);
  }
  return bom;
}

function assertEffectiveWindow(
  from: Date | null | undefined,
  to: Date | null | undefined
): void {
  if (from && to && from > to) {
    throw ApiError.badRequest(
      "INVALID_EFFECTIVE_WINDOW",
      "The effective-from date must be on or before the effective-to date."
    );
  }
}

/**
 * An obsoleted BOM version is permanent history (readiness checks reference it
 * with `onDelete: Restrict`). Its component list is therefore read-only; items
 * must live in a new version instead.
 */
function assertBomMutable(bom: { id: string; version: string; status: BOMVersion["status"] }): void {
  if (bom.status === "OBSOLETE") {
    throw ApiError.conflict(
      "OBSOLETE_BOM_IMMUTABLE",
      `BOM version ${bom.version} is obsoleted and is permanent history. Its components cannot be changed — create a new BOM version instead.`
    );
  }
}

/** Instant comparison that treats null/undefined as equivalent. */
function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (a == null) return b == null;
  if (b == null) return false;
  return a.getTime() === b.getTime();
}

async function findActiveBomConflicts(
  tx: Prisma.TransactionClient,
  productId: string,
  excludeId: string
): Promise<AdvisoryConflict[]> {
  const others = (await tx.bOMVersion.findMany({
    where: { productId, status: "ACTIVE" },
    select: { id: true, version: true },
  })).filter((b) => b.id !== excludeId);

  const conflicts: AdvisoryConflict[] = [];
  for (const other of others) {
    conflicts.push({
      code: "MULTIPLE_ACTIVE_BOMS",
      message: `BOM V${other.version} is already ACTIVE for this product. Two active BOM versions are treated as a blocking configuration conflict by the readiness engine.`,
    });
  }

  const requiredCount = await tx.bOMItem.count({
    where: { bomVersionId: excludeId, isRequired: true },
  });
  if (requiredCount === 0) {
    conflicts.push({
      code: "NO_REQUIRED_COMPONENTS",
      message:
        "This BOM version has no required components yet, so a readiness check will fail Rule 1 (BOM).",
    });
  }

  return conflicts;
}
