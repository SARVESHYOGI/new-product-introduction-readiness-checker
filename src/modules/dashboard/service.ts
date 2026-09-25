import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";

export interface DashboardStats {
  productCount: number;
  activeLineCount: number;
  readyProductCount: number;
  blockedProductCount: number;
  notReadyProductCount: number;
  checkCount: number;
  recentChecks: Array<{
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    status: string;
    score: number;
    createdAt: Date;
  }>;
}

/**
 * Dashboard aggregations. Uses distinct-latest grouping for per-product status
 * so "ready/blocked products" reflects each product's most recent check.
 */
export class DashboardService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  async getStats(limit = 8): Promise<DashboardStats> {
    const [productCount, activeLineCount, checkCount, latestChecks] =
      await Promise.all([
        this.client.product.count(),
        this.client.line.count({ where: { status: "ACTIVE" } }),
        this.client.readinessCheck.count(),
        this.client.readinessCheck.findMany({
          orderBy: { createdAt: "desc" },
          distinct: ["productId"],
          include: { product: { select: { id: true, sku: true, name: true } } },
        }),
      ]);

    let readyProductCount = 0;
    let blockedProductCount = 0;
    let notReadyProductCount = 0;
    for (const check of latestChecks) {
      if (check.status === "READY") readyProductCount += 1;
      else if (check.status === "BLOCKED") blockedProductCount += 1;
      else if (check.status === "NOT_READY") notReadyProductCount += 1;
    }

    const recentChecks = await this.client.readinessCheck.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 50),
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    return {
      productCount,
      activeLineCount,
      readyProductCount,
      blockedProductCount,
      notReadyProductCount,
      checkCount,
      recentChecks: recentChecks.map((c) => ({
        id: c.id,
        productId: c.productId,
        productName: c.product.name,
        productSku: c.product.sku,
        status: c.status,
        score: c.score,
        createdAt: c.createdAt,
      })),
    };
  }
}