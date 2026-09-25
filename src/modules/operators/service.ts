import type {
  AssignmentStatus,
  Operator,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type {
  AssignmentCreateInput,
  AssignmentUpdateInput,
  OperatorCreateInput,
  OperatorUpdateInput,
} from "@/lib/validation/schemas";

export interface OperatorListItem extends Operator {
  assignments: Array<{
    id: string;
    stationId: string;
    stationCode: string;
    stationName: string;
    validFrom: Date;
    validTo: Date;
    status: AssignmentStatus;
  }>;
  /** Assignments that are ACTIVE and whose validity window covers `now`. */
  activeAssignmentCount: number;
}

export interface AssignmentWriteResult {
  assignment: unknown;
  /** Advisory only — the readiness engine remains the authority on readiness. */
  conflicts: AdvisoryConflict[];
}

export interface AdvisoryConflict {
  code: string;
  message: string;
}

export class OperatorService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  async list(includeInactive = false): Promise<OperatorListItem[]> {
    const operators = await this.client.operator.findMany({
      where: includeInactive ? {} : { status: "ACTIVE" },
      include: {
        assignments: {
          include: { station: { select: { code: true, name: true } } },
          orderBy: { validFrom: "desc" },
        },
      },
      orderBy: { employeeCode: "asc" },
    });

    const now = new Date();
    return operators.map((o) => ({
      ...o,
      assignments: o.assignments.map((a) => ({
        id: a.id,
        stationId: a.stationId,
        stationCode: a.station.code,
        stationName: a.station.name,
        validFrom: a.validFrom,
        validTo: a.validTo,
        status: a.status,
      })),
      activeAssignmentCount: o.assignments.filter(
        (a) => a.status === "ACTIVE" && a.validFrom <= now && a.validTo >= now
      ).length,
    }));
  }

  async getById(id: string) {
    return this.client.operator.findUnique({
      where: { id },
      include: {
        assignments: {
          include: { station: { select: { id: true, code: true, name: true, status: true } } },
          orderBy: { validFrom: "desc" },
        },
      },
    });
  }

  async create(input: OperatorCreateInput, actorId: string): Promise<Operator> {
    return withMappedErrors("operator", async () =>
      this.client.$transaction(async (tx) => {
        const operator = await tx.operator.create({
          data: {
            employeeCode: input.employeeCode,
            name: input.name,
            status: input.status,
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "operator.create",
          entityType: "Operator",
          entityId: operator.id,
          metadata: { employeeCode: operator.employeeCode, status: operator.status },
        });
        return operator;
      })
    );
  }

  async update(id: string, input: OperatorUpdateInput, actorId: string): Promise<Operator> {
    return withMappedErrors("operator", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.operator.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Operator ${id} was not found.`);
        }
        const operator = await tx.operator.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "operator.update",
          entityType: "Operator",
          entityId: operator.id,
          metadata: { from: { name: existing.name, status: existing.status }, to: input },
        });
        return operator;
      })
    );
  }

  /**
   * Operators are referenced by historical assignments, so they are never
   * removed. A departure is an ACTIVE → INACTIVE status change, which the
   * readiness engine immediately treats as ineligible (Safety Rule 6: the
   * editor reports, it never silently repairs history).
   */
  async deactivate(id: string, actorId: string): Promise<Operator> {
    return this.update(id, { status: "INACTIVE" }, actorId);
  }

  /**
   * Create a station assignment (a validity window, not a permanent link).
   *
   * Two advisory conflicts are reported rather than blocked, because a plant
   * genuinely has expiring assignments and overlapping windows: the readiness
   * engine decides whether the result is safe.
   */
  async addAssignment(
    operatorId: string,
    input: AssignmentCreateInput,
    actorId: string
  ): Promise<AssignmentWriteResult> {
    return withMappedErrors("operator assignment", async () =>
      this.client.$transaction(async (tx) => {
        const [operator, station] = await Promise.all([
          tx.operator.findUnique({ where: { id: operatorId } }),
          tx.station.findUnique({ where: { id: input.stationId } }),
        ]);
        if (!operator) {
          throw ApiError.notFound("NOT_FOUND", `Operator ${operatorId} was not found.`);
        }
        if (!station) {
          throw ApiError.badRequest("UNKNOWN_STATION", `Station ${input.stationId} does not exist.`);
        }
        if (input.validFrom > input.validTo) {
          throw ApiError.badRequest(
            "INVALID_VALIDITY_WINDOW",
            "The assignment start date must be on or before its end date."
          );
        }

        const conflicts = await findAssignmentConflicts(tx, {
          operatorId,
          stationId: station.id,
          validFrom: input.validFrom,
          validTo: input.validTo,
        });

        const assignment = await tx.operatorStationAssignment.create({
          data: {
            operatorId,
            stationId: station.id,
            validFrom: input.validFrom,
            validTo: input.validTo,
            // New windows are always created active; use PATCH to revoke one.
            status: "ACTIVE",
          },
        });

        await recordAudit(tx, {
          actorId,
          action: "assignment.create",
          entityType: "OperatorStationAssignment",
          entityId: assignment.id,
          metadata: {
            operatorId,
            stationCode: station.code,
            validFrom: input.validFrom.toISOString(),
            validTo: input.validTo.toISOString(),
            status: assignment.status,
          },
        });

        return { assignment, conflicts };
      })
    );
  }

  /**
   * Re-date or revoke an existing assignment.
   *
   * `EXPIRED` is a derived state, not a stored one: an assignment whose window
   * has passed simply stops covering today, and the readiness rule reports it as
   * expired. Storing it would require a nightly job and would still be wrong the
   * moment a window is extended, so the editor stores only ACTIVE/REVOKED.
   */
  async updateAssignment(
    operatorId: string,
    assignmentId: string,
    input: AssignmentUpdateInput,
    actorId: string
  ): Promise<AssignmentWriteResult> {
    return withMappedErrors("operator assignment", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.operatorStationAssignment.findUnique({
          where: { id: assignmentId },
          include: { station: { select: { id: true, code: true } } },
        });
        if (!existing || existing.operatorId !== operatorId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Assignment ${assignmentId} was not found for this operator.`
          );
        }

        const validFrom = input.validFrom ?? existing.validFrom;
        const validTo = input.validTo ?? existing.validTo;
        if (validFrom > validTo) {
          throw ApiError.badRequest(
            "INVALID_VALIDITY_WINDOW",
            "The assignment start date must be on or before its end date."
          );
        }

        const nextStatus = input.status ?? existing.status;
        const conflicts =
          nextStatus === "ACTIVE"
            ? await findAssignmentConflicts(tx, {
                operatorId,
                stationId: existing.stationId,
                validFrom,
                validTo,
                excludeAssignmentId: assignmentId,
              })
            : [];

        const assignment = await tx.operatorStationAssignment.update({
          where: { id: assignmentId },
          data: {
            ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
            ...(input.validTo !== undefined ? { validTo: input.validTo } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });

        await recordAudit(tx, {
          actorId,
          action:
            nextStatus !== existing.status ? "assignment.status_change" : "assignment.update",
          entityType: "OperatorStationAssignment",
          entityId: assignmentId,
          metadata: {
            operatorId,
            stationCode: existing.station.code,
            from: {
              status: existing.status,
              validFrom: existing.validFrom.toISOString(),
              validTo: existing.validTo.toISOString(),
            },
            to: { status: nextStatus, validFrom: validFrom.toISOString(), validTo: validTo.toISOString() },
          },
        });

        return { assignment, conflicts };
      })
    );
  }

  async removeAssignment(operatorId: string, assignmentId: string, actorId: string): Promise<void> {
    return withMappedErrors("operator assignment", async () =>
      this.client.$transaction(async (tx) => {
        const assignment = await tx.operatorStationAssignment.findUnique({
          where: { id: assignmentId },
          include: { station: { select: { code: true } } },
        });
        if (!assignment || assignment.operatorId !== operatorId) {
          throw ApiError.notFound(
            "NOT_FOUND",
            `Assignment ${assignmentId} was not found for this operator.`
          );
        }
        await tx.operatorStationAssignment.delete({ where: { id: assignmentId } });
        await recordAudit(tx, {
          actorId,
          action: "assignment.delete",
          entityType: "OperatorStationAssignment",
          entityId: assignmentId,
          metadata: { operatorId, stationCode: assignment.station.code },
        });
      })
    );
  }
}

async function findAssignmentConflicts(
  tx: Prisma.TransactionClient,
  args: {
    operatorId: string;
    stationId: string;
    validFrom: Date;
    validTo: Date;
    excludeAssignmentId?: string;
  }
): Promise<AdvisoryConflict[]> {
  const conflicts: AdvisoryConflict[] = [];

  // Windows are inclusive on both ends, so two assignments that share even one
  // day overlap — back-to-back windows (1–10 then 11–20) correctly do not.
  const overlapping = await tx.operatorStationAssignment.findMany({
    where: {
      operatorId: args.operatorId,
      stationId: args.stationId,
      status: "ACTIVE",
      validFrom: { lte: args.validTo },
      validTo: { gte: args.validFrom },
      ...(args.excludeAssignmentId ? { id: { not: args.excludeAssignmentId } } : {}),
    },
    select: { id: true },
  });
  if (overlapping.length > 0) {
    conflicts.push({
      code: "OVERLAPPING_ASSIGNMENT",
      message:
        "This operator already has an active assignment to this station covering the same period. A readiness check will use the one with the widest coverage.",
    });
  }

  const station = await tx.station.findUnique({ where: { id: args.stationId } });
  if (station && station.status !== "ACTIVE") {
    conflicts.push({
      code: "STATION_NOT_ACTIVE",
      message: `The station is ${station.status}. An assignment to a station that is not ACTIVE is treated as invalid by the readiness engine.`,
    });
  }

  return conflicts;
}
