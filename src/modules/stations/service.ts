import type { Prisma, PrismaClient, Station, StationStatus } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { StationCreateInput, StationUpdateInput } from "@/lib/validation/schemas";

export interface StationListItem extends Station {
  line: { id: string; code: string; name: string } | null;
  /** Operators eligible to run this station right now (see OperatorService). */
  operatorCount: number;
}

export class StationService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  /**
   * All stations, including INACTIVE and MAINTENANCE ones.
   *
   * A configuration editor must be able to *see and fix* a station that is in
   * maintenance or deactivated — that is precisely the state that produces a
   * BLOCKED readiness result. Filtering those out would hide the problem.
   */
  async list(options: { lineId?: string; status?: StationStatus } = {}): Promise<StationListItem[]> {
    const now = new Date();
    const stations = await this.client.station.findMany({
      where: {
        ...(options.lineId ? { lineId: options.lineId } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      include: {
        line: { select: { id: true, code: true, name: true } },
        // Counted with the same eligibility rule the readiness engine applies,
        // so "2 operators" in this panel can never contradict "no active
        // operator" in a check result.
        assignments: {
          where: {
            status: "ACTIVE",
            validFrom: { lte: now },
            validTo: { gte: now },
            operator: { status: "ACTIVE" },
          },
          select: { id: true },
        },
      },
      orderBy: { code: "asc" },
    });
    return stations.map((s) => ({ ...s, operatorCount: s.assignments.length }));
  }

  async getById(id: string) {
    return this.client.station.findUnique({
      where: { id },
      include: {
        line: { select: { id: true, code: true, name: true } },
        assignments: { include: { operator: true }, orderBy: { validFrom: "desc" } },
      },
    });
  }

  async create(input: StationCreateInput, actorId: string): Promise<Station> {
    return withMappedErrors("station", async () =>
      this.client.$transaction(async (tx) => {
        if (input.lineId) await assertLineExists(tx, input.lineId);
        const station = await tx.station.create({
          data: {
            code: input.code,
            name: input.name,
            status: input.status,
            lineId: input.lineId ?? null,
            capabilities: input.capabilities,
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "station.create",
          entityType: "Station",
          entityId: station.id,
          metadata: {
            code: station.code,
            status: station.status,
            lineId: station.lineId,
            capabilities: station.capabilities,
          },
        });
        return station;
      })
    );
  }

  async update(id: string, input: StationUpdateInput, actorId: string): Promise<Station> {
    return withMappedErrors("station", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.station.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Station ${id} was not found.`);
        }
        if (input.lineId) await assertLineExists(tx, input.lineId);

        const station = await tx.station.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.lineId !== undefined ? { lineId: input.lineId } : {}),
            ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "station.update",
          entityType: "Station",
          entityId: station.id,
          metadata: {
            from: {
              name: existing.name,
              status: existing.status,
              lineId: existing.lineId,
            },
            to: input,
          },
        });
        return station;
      })
    );
  }

  /**
   * Status is the meaningful lifecycle control for a station: `MAINTENANCE` is
   * what makes a station fail Safety Rule 5, and `INACTIVE` is what makes a
   * routing reference a CRITICAL conflicting-configuration failure. There is
   * deliberately no delete — the station may be referenced by routings
   * (`onDelete: SetNull`) and by the historical readiness record.
   */
  async setStatus(id: string, status: StationStatus, actorId: string): Promise<Station> {
    return this.update(id, { status }, actorId);
  }
}

/** Structural type so this works with both a transaction client and the root client. */
async function assertLineExists(tx: Prisma.TransactionClient, lineId: string): Promise<void> {
  const line = await tx.line.findUnique({ where: { id: lineId } });
  if (!line) {
    throw ApiError.badRequest(
      "UNKNOWN_LINE",
      `Production line ${lineId} does not exist.`
    );
  }
}
