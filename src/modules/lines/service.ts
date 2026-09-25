import type { PrismaClient, Line, LineStatus } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { LineCreateInput, LineUpdateInput } from "@/lib/validation/schemas";

export type LineListItem = Pick<Line, "id" | "code" | "name" | "status"> & {
  stationCount: number;
};

export class LineService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  async list(includeInactive = false): Promise<LineListItem[]> {
    const lines = await this.client.line.findMany({
      where: includeInactive ? {} : { status: "ACTIVE" },
      include: { _count: { select: { stations: true } } },
      orderBy: { code: "asc" },
    });
    return lines.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      status: l.status,
      stationCount: l._count.stations,
    }));
  }

  async getById(id: string) {
    return this.client.line.findUnique({
      where: { id },
      include: {
        stations: { orderBy: { code: "asc" } },
      },
    });
  }

  async create(input: LineCreateInput, actorId: string): Promise<Line> {
    return withMappedErrors("production line", async () =>
      this.client.$transaction(async (tx) => {
        const line = await tx.line.create({
          data: { code: input.code, name: input.name, status: input.status },
        });
        await recordAudit(tx, {
          actorId,
          action: "line.create",
          entityType: "Line",
          entityId: line.id,
          metadata: { code: line.code, name: line.name, status: line.status },
        });
        return line;
      })
    );
  }

  async update(id: string, input: LineUpdateInput, actorId: string): Promise<Line> {
    return withMappedErrors("production line", async () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.line.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Production line ${id} was not found.`);
        }
        const line = await tx.line.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "line.update",
          entityType: "Line",
          entityId: line.id,
          metadata: { from: { name: existing.name, status: existing.status }, to: input },
        });
        return line;
      })
    );
  }

  /**
   * Deactivating a line is a status change, not a delete: readiness checks
   * reference the line with `onDelete: Restrict` and the historical record must
   * stay readable. Stations keep their `lineId` so the line can be reactivated.
   */
  async setStatus(id: string, status: LineStatus, actorId: string): Promise<Line> {
    return this.update(id, { status }, actorId);
  }
}
