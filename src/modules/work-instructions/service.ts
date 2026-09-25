import type { Prisma, PrismaClient, WorkInstruction } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AdvisoryConflict } from "@/modules/operators/service";
import type {
  WorkInstructionCreateInput,
  WorkInstructionUpdateInput,
} from "@/lib/validation/schemas";

export interface WorkInstructionListItem extends WorkInstruction {
  routingOperation: {
    id: string;
    sequence: number;
    operationCode: string;
    operationName: string;
    required: boolean;
    routingId: string;
    routingCode: string;
    productId: string;
    productName: string;
  };
}

export interface WorkInstructionWriteResult<T> {
  entity: T;
  /** Advisory only — the readiness engine remains the authority on readiness. */
  conflicts: AdvisoryConflict[];
}

export class WorkInstructionService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  /**
   * Work instructions across every routing operation, optionally narrowed to one
   * product. The editor needs all of them, including the ones on obsolete
   * routings, because "this operation has only an old instruction" is exactly
   * the kind of thing an engineer needs to see.
   */
  async list(
    options: { productId?: string; routingOperationId?: string } = {}
  ): Promise<WorkInstructionListItem[]> {
    return this.client.workInstruction.findMany({
      where: {
        ...(options.routingOperationId ? { routingOperationId: options.routingOperationId } : {}),
        ...(options.productId
          ? { routingOperation: { routing: { productId: options.productId } } }
          : {}),
      },
      select: {
        id: true,
        routingOperationId: true,
        title: true,
        content: true,
        version: true,
        status: true,
        required: true,
        routingOperation: {
          select: {
            id: true,
            sequence: true,
            operationCode: true,
            operationName: true,
            required: true,
            routing: {
              select: {
                id: true,
                code: true,
                product: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ version: "desc" }],
    }).then((rows) =>
      rows.map((row) => ({
        ...row,
        routingOperation: {
          id: row.routingOperation.id,
          sequence: row.routingOperation.sequence,
          operationCode: row.routingOperation.operationCode,
          operationName: row.routingOperation.operationName,
          required: row.routingOperation.required,
          routingId: row.routingOperation.routing.id,
          routingCode: row.routingOperation.routing.code,
          productId: row.routingOperation.routing.product.id,
          productName: row.routingOperation.routing.product.name,
        },
      }))
    );
  }

  async getById(id: string) {
    return this.client.workInstruction.findUnique({
      where: { id },
      include: { routingOperation: { include: { routing: true } } },
    });
  }

  /**
   * Create the next version of an instruction. The version number is derived
   * server-side from the existing rows so two concurrent creates cannot claim
   * the same version (the `(routingOperationId, version)` unique constraint is
   * the backstop).
   *
   * Creating an ACTIVE version supersedes the previously active one in the same
   * transaction: publishing a new instruction is exactly how the product is
   * retrained onto new wording, so two simultaneously active versions must never
   * be creatable through the editor (Safety Rule 3).
   */
  async create(
    routingOperationId: string,
    input: WorkInstructionCreateInput,
    actorId: string
  ): Promise<WorkInstructionWriteResult<WorkInstruction>> {
    return withMappedErrors("work instruction", async () =>
      this.client.$transaction(async (tx) => {
        const operation = await tx.routingOperation.findUnique({
          where: { id: routingOperationId },
          include: { routing: { select: { id: true, code: true, productId: true } } },
        });
        if (!operation) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Routing operation ${routingOperationId} was not found.`
          );
        }

        const latest = await tx.workInstruction.findFirst({
          where: { routingOperationId },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const version = (latest?.version ?? 0) + 1;

        const instruction = await tx.workInstruction.create({
          data: {
            routingOperationId,
            title: input.title,
            content: input.content,
            version,
            status: input.status,
            required: input.required,
          },
        });

        const superseded = await supersedeActiveInstructions(tx, {
          routingOperationId,
          keepId: instruction.id,
        });

        const conflicts = await findInstructionConflicts(tx, {
          routingOperationId,
          operationName: operation.operationName,
          routingCode: operation.routing.code,
        });

        await recordAudit(tx, {
          actorId,
          action: "work_instruction.create",
          entityType: "WorkInstruction",
          entityId: instruction.id,
          metadata: {
            routingOperationId,
            operationCode: operation.operationCode,
            version,
            status: instruction.status,
            supersededVersions: superseded,
          },
        });

        return { entity: instruction, conflicts };
      })
    );
  }

  /**
   * Lifecycle rules enforced here (see README "Configuration lifecycle"):
   *
   *  - DRAFT    → freely editable; may be activated or discarded.
   *  - ACTIVE   → published. Content is frozen; the only legal transition is
   *               ACTIVE → OBSOLETE. Editing published wording in place would
   *               change the document operators were trained against with no
   *               trace, so a new version must be created instead.
   *  - OBSOLETE → frozen. Never reactivated and never edited; a re-publish is a
   *               new version.
   */
  async update(
    id: string,
    input: WorkInstructionUpdateInput,
    actorId: string
  ): Promise<WorkInstructionWriteResult<WorkInstruction>> {
    return withMappedErrors("work instruction", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.workInstruction.findUnique({
          where: { id },
          include: {
            routingOperation: {
              select: {
                id: true,
                operationName: true,
                required: true,
                routing: { select: { code: true } },
              },
            },
          },
        });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Work instruction ${id} was not found.`);
        }

        const contentChanged =
          (input.title !== undefined && input.title !== existing.title) ||
          (input.content !== undefined && input.content !== existing.content) ||
          (input.required !== undefined && input.required !== existing.required);

        if (existing.status === "ACTIVE" && contentChanged) {
          throw ApiError.conflict(
            "ACTIVE_INSTRUCTION_IMMUTABLE",
            "A published work instruction cannot be edited. Create the next version instead, then mark this one OBSOLETE."
          );
        }
        if (existing.status === "OBSOLETE") {
          throw ApiError.conflict(
            "OBSOLETE_INSTRUCTION_IMMUTABLE",
            "An obsoleted work instruction is permanent history. Create a new version to change the instruction."
          );
        }

        // DRAFT → ACTIVE publishes the instruction and obsoletes whatever was
        // active before; every other transition is handled above.
        const nextStatus = input.status ?? existing.status;

        const instruction = await tx.workInstruction.update({
          where: { id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.content !== undefined ? { content: input.content } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.required !== undefined ? { required: input.required } : {}),
          },
        });

        const superseded =
          nextStatus === "ACTIVE" && existing.status !== "ACTIVE"
            ? await supersedeActiveInstructions(tx, {
                routingOperationId: existing.routingOperationId,
                keepId: instruction.id,
              })
            : [];

        const conflicts = await findInstructionConflicts(tx, {
          routingOperationId: existing.routingOperationId,
          operationName: existing.routingOperation.operationName,
          routingCode: existing.routingOperation.routing.code,
        });

        await recordAudit(tx, {
          actorId,
          action:
            input.status !== undefined && input.status !== existing.status
              ? "work_instruction.status_change"
              : "work_instruction.update",
          entityType: "WorkInstruction",
          entityId: instruction.id,
          metadata: {
            from: { status: existing.status, title: existing.title, version: existing.version },
            to: input,
            supersededVersions: superseded,
          },
        });

        return { entity: instruction, conflicts };
      })
    );
  }

  /**
   * Instructions are versioned, so the normal path is to create a new version
   * and obsolete the old one. Delete exists only for cleanup of a DRAFT that was
   * never published — an ACTIVE or OBSOLETE instruction is history and is
   * retained.
   */
  async remove(id: string, actorId: string): Promise<void> {
    return withMappedErrors("work instruction", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.workInstruction.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Work instruction ${id} was not found.`);
        }
        if (existing.status !== "DRAFT") {
          throw ApiError.conflict(
            "PUBLISHED_INSTRUCTION_IMMUTABLE",
            "Only a DRAFT work instruction can be deleted. Published versions are obsoleted, never removed."
          );
        }
        await tx.workInstruction.delete({ where: { id } });
        await recordAudit(tx, {
          actorId,
          action: "work_instruction.delete",
          entityType: "WorkInstruction",
          entityId: id,
          metadata: { version: existing.version, status: existing.status },
        });
      })
    );
  }
}

/**
 * Move every other ACTIVE version of an instruction to OBSOLETE, returning the
 * versions that were superseded so the audit trail records what the new version
 * replaced.
 */
async function supersedeActiveInstructions(
  tx: Prisma.TransactionClient,
  args: { routingOperationId: string; keepId: string }
): Promise<number[]> {
  const others = await tx.workInstruction.findMany({
    where: {
      routingOperationId: args.routingOperationId,
      status: "ACTIVE",
      id: { not: args.keepId },
    },
    select: { id: true, version: true },
    orderBy: { version: "asc" },
  });
  if (others.length === 0) return [];

  await tx.workInstruction.updateMany({
    where: { id: { in: others.map((o) => o.id) } },
    data: { status: "OBSOLETE" },
  });
  return others.map((o) => o.version);
}

async function findInstructionConflicts(
  tx: Prisma.TransactionClient,
  args: {
    routingOperationId: string;
    operationName: string;
    routingCode: string;
  }
): Promise<AdvisoryConflict[]> {
  const conflicts: AdvisoryConflict[] = [];
  const actives = await tx.workInstruction.findMany({
    where: { routingOperationId: args.routingOperationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (actives.length > 1) {
    conflicts.push({
      code: "MULTIPLE_ACTIVE_INSTRUCTIONS",
      message: `"${args.operationName}" still has ${actives.length} active work instruction versions. The readiness engine treats more than one active version as a blocking conflict.`,
    });
  }
  return conflicts;
}
