import type { PrismaClient, Product, ProductStatus } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/errors";
import type { ProductCreateInput } from "@/lib/validation/schemas";

export interface ProductListItem extends Product {
  _count: { bomVersions: number; routings: number; readinessChecks: number };
  lastCheckStatus?: string | null;
  lastCheckScore?: number | null;
}

export class ProductService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  async list(params: {
    search?: string;
    status?: ProductStatus;
    limit?: number;
  } = {}): Promise<ProductListItem[]> {
    const { search, status, limit = 100 } = params;
    const products = await this.client.product.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { bomVersions: true, routings: true, readinessChecks: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
    });

    // Attach the most recent readiness status per product (used by the UI).
    const checks = await this.client.readinessCheck.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      orderBy: { createdAt: "desc" },
      distinct: ["productId"],
      select: { productId: true, status: true, score: true },
    });
    const latestByProduct = new Map(checks.map((c) => [c.productId, c]));

    return products.map((p) => ({
      ...p,
      lastCheckStatus: latestByProduct.get(p.id)?.status ?? null,
      lastCheckScore: latestByProduct.get(p.id)?.score ?? null,
    }));
  }

  async getById(id: string): Promise<Product | null> {
    return this.client.product.findUnique({ where: { id } });
  }

  async create(input: ProductCreateInput, actorId: string): Promise<Product> {
    return this.client.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { sku: input.sku } });
      if (existing) {
        throw ApiError.badRequest(
          "DUPLICATE_SKU",
          `A product with SKU ${input.sku} already exists.`
        );
      }
      const product = await tx.product.create({
        data: {
          sku: input.sku,
          name: input.name,
          description: input.description,
          status: input.status,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "product.create",
          entityType: "Product",
          entityId: product.id,
          metadata: { sku: product.sku },
        },
      });
      return product;
    });
  }
}