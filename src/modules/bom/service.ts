import type { PrismaClient, BOMVersion } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";

export type BomListItem = Pick<
  BOMVersion,
  "id" | "version" | "status" | "effectiveFrom" | "effectiveTo" | "createdAt"
> & { itemCount: number };

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
}