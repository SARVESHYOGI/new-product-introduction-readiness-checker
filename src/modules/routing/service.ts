import type { PrismaClient, Routing, Prisma } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AdvisoryConflict } from "@/modules/operators/service";
import { assertVersionTransition } from "@/lib/version-lifecycle";
import type {
  RoutingCreateInput,
  RoutingOperationCreateInput,
  RoutingOperationUpdateInput,
  RoutingUpdateInput,
} from "@/lib/validation/schemas";

export type RoutingListItem = Pick<Routing, "id" | "code" | "version" | "status" | "createdAt"> & {
  operationCount: number;
};

export interface RoutingWriteResult<T> {
  entity: T;
  /** Advisory only — the readiness engine remains the authority on readiness. */
  conflicts: AdvisoryConflict[];
}

export class RoutingService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  async listByProduct(productId: string): Promise<RoutingListItem[]> {
    const routings = await this.client.routing.findMany({
      where: { productId },
      include: { _count: { select: { operations: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return routings.map((r) => ({
      id: r.id,
      code: r.code,
      version: r.version,
      status: r.status,
      createdAt: r.createdAt,
      operationCount: r._count.operations,
    }));
  }

  async getById(id: string) {
    return this.client.routing.findUnique({
      where: { id },
      include: {
        operations: {
          orderBy: { sequence: "asc" },
          include: {
            station: { select: { id: true, code: true, name: true, status: true, lineId: true } },
            workInstructions: { orderBy: { version: "desc" } },
          },
        },
        product: { select: { id: true, sku: true, name: true } },
      },
    });
  }

  async create(
    productId: string,
    input: RoutingCreateInput,
    actorId: string
  ): Promise<RoutingWriteResult<Routing>> {
    return withMappedErrors("routing", async () =>
      this.client.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw ApiError.notFound("NOT_FOUND", `Product ${productId} was not found.`);
        }
        const routing = await tx.routing.create({
          data: {
            productId,
            code: input.code,
            version: input.version,
            status: input.status,
          },
        });
        const conflicts =
          input.status === "ACTIVE"
            ? await findActiveRoutingConflicts(tx, productId, routing.id)
            : [];
        await recordAudit(tx, {
          actorId,
          action: "routing.create",
          entityType: "Routing",
          entityId: routing.id,
          metadata: { productId, code: routing.code, version: routing.version, status: routing.status },
        });
        return { entity: routing, conflicts };
      })
    );
  }

  async update(
    id: string,
    input: RoutingUpdateInput,
    actorId: string
  ): Promise<RoutingWriteResult<Routing>> {
    return withMappedErrors("routing", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.routing.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Routing ${id} was not found.`);
        }

        // Lifecycle policy shared with BOM versions and work instructions:
        // ACTIVE → DRAFT and any transition out of OBSOLETE are rejected.
        const nextStatus = input.status ?? existing.status;
        assertVersionTransition(existing.status, nextStatus, "Routing");

        // The version label is identity once published: renaming an ACTIVE or
        // OBSOLETE routing's version would rewrite the identity operators and
        // historical checks reference. A no-op re-save is permitted.
        if (
          (existing.status === "ACTIVE" || existing.status === "OBSOLETE") &&
          input.version !== undefined &&
          input.version !== existing.version
        ) {
          throw ApiError.conflict(
            "PUBLISHED_ROUTING_IMMUTABLE",
            "A published routing's version label is frozen. Supersede this routing and create a new one if the version must change."
          );
        }

        const routing = await tx.routing.update({
          where: { id },
          data: {
            ...(input.version !== undefined ? { version: input.version } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        const conflicts =
          nextStatus === "ACTIVE" && existing.status !== "ACTIVE"
            ? await findActiveRoutingConflicts(tx, existing.productId, id)
            : [];
        await recordAudit(tx, {
          actorId,
          action:
            input.status !== undefined && input.status !== existing.status
              ? "routing.status_change"
              : "routing.update",
          entityType: "Routing",
          entityId: routing.id,
          metadata: { from: { status: existing.status }, to: input },
        });
        return { entity: routing, conflicts };
      })
    );
  }

  /** Supersede rather than delete — see `BomService.obsolete`. */
  async obsolete(id: string, actorId: string): Promise<RoutingWriteResult<Routing>> {
    return this.update(id, { status: "OBSOLETE" }, actorId);
  }

  async addOperation(
    routingId: string,
    input: RoutingOperationCreateInput,
    actorId: string
  ): Promise<RoutingWriteResult<unknown>> {
    return withMappedErrors("routing operation", async () =>
      this.client.$transaction(async (tx) => {
        const routing = await assertRoutingExists(tx, routingId);
        assertRoutingMutable(routing);
        if (input.stationId) {
          const station = await tx.station.findUnique({ where: { id: input.stationId } });
          if (!station) {
            throw ApiError.badRequest(
              "UNKNOWN_STATION",
              `Station ${input.stationId} does not exist.`
            );
          }
        }

        const operation = await tx.routingOperation.create({
          data: {
            routingId,
            sequence: input.sequence,
            operationCode: input.operationCode,
            operationName: input.operationName,
            standardCycleTimeSeconds: input.standardCycleTimeSeconds ?? null,
            required: input.required,
            stationId: input.stationId ?? null,
          },
        });

        const conflicts = await findOperationConflicts(tx, {
          routingId,
          operationId: operation.id,
          stationId: operation.stationId,
          required: operation.required,
          routingCode: routing.code,
          operationName: operation.operationName,
        });

        await recordAudit(tx, {
          actorId,
          action: "routing_operation.create",
          entityType: "RoutingOperation",
          entityId: operation.id,
          metadata: {
            routingId,
            routingCode: routing.code,
            sequence: operation.sequence,
            operationCode: operation.operationCode,
            stationId: operation.stationId,
          },
        });

        return { entity: operation, conflicts };
      })
    );
  }

  async updateOperation(
    routingId: string,
    operationId: string,
    input: RoutingOperationUpdateInput,
    actorId: string
  ): Promise<RoutingWriteResult<unknown>> {
    return withMappedErrors("routing operation", async () =>
      this.client.$transaction(async (tx) => {
        const routing = await assertRoutingExists(tx, routingId);
        assertRoutingMutable(routing);
        const existing = await tx.routingOperation.findUnique({ where: { id: operationId } });
        if (!existing || existing.routingId !== routingId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Routing operation ${operationId} was not found on this routing.`
          );
        }
        if (input.stationId) {
          const station = await tx.station.findUnique({ where: { id: input.stationId } });
          if (!station) {
            throw ApiError.badRequest(
              "UNKNOWN_STATION",
              `Station ${input.stationId} does not exist.`
            );
          }
        }

        const operation = await tx.routingOperation.update({
          where: { id: operationId },
          data: {
            ...(input.operationCode !== undefined ? { operationCode: input.operationCode } : {}),
            ...(input.operationName !== undefined ? { operationName: input.operationName } : {}),
            ...(input.standardCycleTimeSeconds !== undefined
              ? { standardCycleTimeSeconds: input.standardCycleTimeSeconds }
              : {}),
            ...(input.required !== undefined ? { required: input.required } : {}),
            ...(input.stationId !== undefined ? { stationId: input.stationId } : {}),
          },
        });

        const conflicts = await findOperationConflicts(tx, {
          routingId,
          operationId: operation.id,
          stationId: operation.stationId,
          required: operation.required,
          routingCode: routing.code,
          operationName: operation.operationName,
        });

        await recordAudit(tx, {
          actorId,
          action: "routing_operation.update",
          entityType: "RoutingOperation",
          entityId: operation.id,
          metadata: { routingId, from: { stationId: existing.stationId }, to: input },
        });

        return { entity: operation, conflicts };
      })
    );
  }

  async removeOperation(routingId: string, operationId: string, actorId: string): Promise<void> {
    return withMappedErrors("routing operation", async () =>
      this.client.$transaction(async (tx) => {
        const routing = await assertRoutingExists(tx, routingId);
        assertRoutingMutable(routing);
        const existing = await tx.routingOperation.findUnique({ where: { id: operationId } });
        if (!existing || existing.routingId !== routingId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Routing operation ${operationId} was not found on this routing.`
          );
        }
        await tx.routingOperation.delete({ where: { id: operationId } });
        await recordAudit(tx, {
          actorId,
          action: "routing_operation.delete",
          entityType: "RoutingOperation",
          entityId: operationId,
          metadata: { routingId, operationCode: existing.operationCode },
        });
      })
    );
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function assertRoutingExists(
  tx: Prisma.TransactionClient,
  routingId: string
): Promise<{ id: string; code: string; status: Routing["status"] }> {
  const routing = await tx.routing.findUnique({ where: { id: routingId } });
  if (!routing) {
    throw ApiError.notFound("NOT_FOUND", `Routing ${routingId} was not found.`);
  }
  return routing;
}

/**
 * An obsoleted routing is permanent history (readiness checks reference it with
 * `onDelete: Restrict`). Its operation list is therefore read-only; operations
 * must live in a new routing version instead.
 */
function assertRoutingMutable(routing: {
  id: string;
  code: string;
  status: Routing["status"];
}): void {
  if (routing.status === "OBSOLETE") {
    throw ApiError.conflict(
      "OBSOLETE_ROUTING_IMMUTABLE",
      `Routing ${routing.code} is obsoleted and is permanent history. Its operations cannot be changed — create a new routing version instead.`
    );
  }
}

/**
 * Advisories for a routing that is (or is becoming) ACTIVE.
 *
 * A product must have exactly one active routing, but the database cannot
 * enforce that: superseding a routing means creating a new version of the same
 * code, and a plant must be able to record the intermediate state where two
 * versions are briefly active. The readiness engine reports the duplicate as a
 * blocking conflict; the editor warns as soon as it is created.
 */
async function findActiveRoutingConflicts(
  tx: Prisma.TransactionClient,
  productId: string,
  excludeId: string
): Promise<AdvisoryConflict[]> {
  const conflicts: AdvisoryConflict[] = [];
  const operationCount = await tx.routingOperation.count({ where: { routingId: excludeId } });
  if (operationCount === 0) {
    conflicts.push({
      code: "NO_OPERATIONS",
      message:
        "This routing has no operations yet, so a readiness check will fail Rule 2 (Routing).",
    });
  }

  const otherActive = await tx.routing.findMany({
    where: { productId, status: "ACTIVE", id: { not: excludeId } },
    select: { id: true, code: true, version: true },
  });
  if (otherActive.length > 0) {
    conflicts.push({
      code: "MULTIPLE_ACTIVE_ROUTINGS",
      message: `${otherActive.length} other routing(s) are already ACTIVE for this product (${otherActive
        .map((r) => `${r.code} v${r.version}`)
        .join(", ")}). The readiness engine blocks production unless exactly one routing is active.`,
    });
  }

  return conflicts;
}

async function findOperationConflicts(
  tx: Prisma.TransactionClient,
  args: {
    routingId: string;
    operationId: string;
    stationId: string | null;
    required: boolean;
    routingCode: string;
    operationName: string;
  }
): Promise<AdvisoryConflict[]> {
  const conflicts: AdvisoryConflict[] = [];

  if (args.required && !args.stationId) {
    conflicts.push({
      code: "OPERATION_WITHOUT_STATION",
      message: `"${args.operationName}" is a required operation with no station assigned. A readiness check will fail Rule 2 (Routing) and Rule 7 (Stations).`,
    });
  }

  if (args.stationId) {
    const station = await tx.station.findUnique({ where: { id: args.stationId } });
    if (station) {
      if (station.status === "INACTIVE") {
        conflicts.push({
          code: "STATION_INACTIVE",
          message: `The station assigned to "${args.operationName}" is INACTIVE. The readiness engine treats a routing pointing at an inactive station as a CRITICAL conflict.`,
        });
      } else if (station.status === "MAINTENANCE") {
        conflicts.push({
          code: "STATION_MAINTENANCE",
          message: `The station assigned to "${args.operationName}" is in MAINTENANCE and is never treated as production-ready.`,
        });
      }
      if (station.lineId === null) {
        conflicts.push({
          code: "STATION_NOT_ON_A_LINE",
          message: `The station assigned to "${args.operationName}" is not attached to a production line, so no line can be selected for it.`,
        });
      }
    }
  }

  const wiCount = await tx.workInstruction.count({
    where: { routingOperationId: args.operationId },
  });
  if (args.required && wiCount === 0) {
    conflicts.push({
      code: "MISSING_WORK_INSTRUCTION",
      message: `"${args.operationName}" has no work instruction yet. A readiness check will fail Rule 3 (Work Instructions).`,
    });
  }

  return conflicts;
}
