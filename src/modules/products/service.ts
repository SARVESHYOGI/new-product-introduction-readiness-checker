import type {
  Prisma,
  PrismaClient,
  Product,
  ProductStatus,
  ReadinessCheckStatus,
} from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/errors";
import { withMappedErrors } from "@/lib/db/errors";
import { recordAudit } from "@/lib/audit";
import type { ProductCreateInput, ProductUpdateInput } from "@/lib/validation/schemas";

/**
 * Configuration pieces a product needs before a readiness check can even be
 * requested. The order is the remediation order used by the UI.
 */
export type ConfigurationGap = "BOM" | "ROUTING";

export interface ProductConfiguration {
  hasBom: boolean;
  hasRouting: boolean;
  /**
   * True when the product has both a BOM version and a routing. A product that
   * exists in the catalog is NOT the same thing as a product that can be
   * checked — an unconfigured product can never produce a READY result.
   */
  isConfigured: boolean;
  /** What is still missing, in remediation order. Empty when configured. */
  missing: ConfigurationGap[];
}

/**
 * Pure derivation of the configuration status. Kept separate (and dependency
 * free) so the rule is unit-testable and so the UI never has to re-derive it.
 */
export function deriveConfiguration(counts: {
  bomVersions: number;
  routings: number;
}): ProductConfiguration {
  const missing: ConfigurationGap[] = [];
  if (counts.bomVersions < 1) missing.push("BOM");
  if (counts.routings < 1) missing.push("ROUTING");
  return {
    hasBom: counts.bomVersions > 0,
    hasRouting: counts.routings > 0,
    isConfigured: missing.length === 0,
    missing,
  };
}

export interface ProductListItem extends Product {
  _count: { bomVersions: number; routings: number; readinessChecks: number };
  configuration: ProductConfiguration;
  lastCheckStatus: ReadinessCheckStatus | null;
  lastCheckScore: number | null;
}

const listItemSelect = {
  _count: { select: { bomVersions: true, routings: true, readinessChecks: true } },
} as const;

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
      include: listItemSelect,
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

    return products.map((p) => this.toListItem(p, latestByProduct.get(p.id)));
  }

  /**
   * Product detail. Returns the *same* shape as list() so the client can share
   * one `ProductListItem` type between the catalog grid and the detail page.
   */
  async getById(id: string): Promise<ProductListItem | null> {
    const product = await this.client.product.findUnique({
      where: { id },
      include: listItemSelect,
    });
    if (!product) return null;

    const latest = await this.client.readinessCheck.findFirst({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      select: { productId: true, status: true, score: true },
    });
    return this.toListItem(product, latest);
  }

  private toListItem(
    product: Product & {
      _count: { bomVersions: number; routings: number; readinessChecks: number };
    },
    latest?: { productId: string; status: ReadinessCheckStatus; score: number } | null
  ): ProductListItem {
    return {
      ...product,
      configuration: deriveConfiguration({
        bomVersions: product._count.bomVersions,
        routings: product._count.routings,
      }),
      lastCheckStatus: latest?.status ?? null,
      lastCheckScore: latest?.score ?? null,
    };
  }

  async create(input: ProductCreateInput, actorId: string): Promise<Product> {
    return withMappedErrors("product", () =>
      this.client.$transaction(async (tx) => {
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
        await recordAudit(tx, {
          actorId,
          action: "product.create",
          entityType: "Product",
          entityId: product.id,
          metadata: { sku: product.sku, status: product.status },
        });
        return product;
      })
    );
  }

  /**
   * SKU is intentionally immutable: it is the natural key that BOM components,
   * inventory items, and identifier prefixes are matched against. Renaming it
   * would silently invalidate those relationships, so the editor only exposes
   * name, description, and status.
   */
  async update(id: string, input: ProductUpdateInput, actorId: string): Promise<Product> {
    return withMappedErrors("product", () =>
      this.client.$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.product.findUnique({ where: { id } });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Product ${id} was not found.`);
        }
        const product = await tx.product.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        await recordAudit(tx, {
          actorId,
          action: "product.update",
          entityType: "Product",
          entityId: product.id,
          metadata: {
            from: { name: existing.name, status: existing.status },
            to: input,
          },
        });
        return product;
      })
    );
  }

  /**
   * A product can only be deleted while it is still a draft with no dependent
   * configuration and no readiness history. Once a check has run against it,
   * `ReadinessCheck` uses `onDelete: Restrict`, so deletion is impossible by
   * design — set it to INACTIVE instead so the immutable history stays readable.
   */
  async delete(id: string, actorId: string): Promise<void> {
    return withMappedErrors("product", () =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.product.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                readinessChecks: true,
                bomVersions: true,
                routings: true,
                identifierRanges: true,
                inventoryMappings: true,
              },
            },
          },
        });
        if (!existing) {
          throw ApiError.notFound("NOT_FOUND", `Product ${id} was not found.`);
        }

        const { readinessChecks, bomVersions, routings, identifierRanges, inventoryMappings } =
          existing._count;
        const blockers: string[] = [];
        if (readinessChecks > 0) {
          blockers.push(`${readinessChecks} readiness check(s)`);
        }
        if (bomVersions > 0) blockers.push(`${bomVersions} BOM version(s)`);
        if (routings > 0) blockers.push(`${routings} routing(s)`);
        if (identifierRanges > 0) blockers.push(`${identifierRanges} identifier range(s)`);
        if (inventoryMappings > 0) blockers.push(`${inventoryMappings} inventory mapping(s)`);

        if (blockers.length > 0) {
          throw ApiError.conflict(
            "PRODUCT_HAS_DEPENDENTS",
            `${existing.name} cannot be deleted because it still has ${blockers.join(", ")}. Remove the dependent configuration first, or set the product to INACTIVE to keep its readiness history.`
          );
        }

        await tx.product.delete({ where: { id } });
        await recordAudit(tx, {
          actorId,
          action: "product.delete",
          entityType: "Product",
          entityId: id,
          metadata: { sku: existing.sku, name: existing.name },
        });
      })
    );
  }
}