import type { PrismaClient, Line } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";

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
}