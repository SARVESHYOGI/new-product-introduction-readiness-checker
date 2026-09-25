import type { PrismaClient, Routing } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";

export type RoutingListItem = Pick<
  Routing,
  "id" | "code" | "version" | "status" | "createdAt"
> & { operationCount: number };

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
    const routing = await this.client.routing.findUnique({
      where: { id },
      include: {
        operations: { orderBy: { sequence: "asc" } },
        product: { select: { id: true, sku: true, name: true } },
      },
    });
    if (!routing) return null;

    const stationIds = [
      ...new Set(
        routing.operations
          .map((op) => op.stationId)
          .filter((id): id is string => id != null)
      ),
    ];
    const stations =
      stationIds.length > 0
        ? await this.client.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationById = new Map(stations.map((s) => [s.id, s]));

    return {
      ...routing,
      operations: routing.operations.map((op) => ({
        ...op,
        station: op.stationId ? (stationById.get(op.stationId) ?? null) : null,
      })),
    };
  }
}