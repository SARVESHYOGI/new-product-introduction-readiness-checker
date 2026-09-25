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
 * Gaps in the configuration a product needs before a readiness check can even
 * be requested. The order is the remediation order used by the UI.
 *
 * Status-aware on purpose: a product whose only BOM/routing is DRAFT (or whose
 * ACTIVE BOM/routing is empty) is NOT checkable, even though rows exist. The
 * count-vs-capability distinction matters because the readiness engine is the
 * authority on* readiness*, but the editor must not label a DRAFT-only product
 * "configured" or let a user run a check that is guaranteed to fail on
 * configuration.
 */
export type ConfigurationGap =
  | "ACTIVE_BOM"
  | "BOM_REQUIRED_ITEMS"
  | "ACTIVE_ROUTING"
  | "ROUTING_OPERATIONS";

export interface ProductConfiguration {
  hasBom: boolean;
  hasRouting: boolean;
  /** True when at least one ACTIVE BOM version has a required component. */
  activeBomWithRequiredItems: boolean;
  /** True when at least one ACTIVE routing has an operation. */
  activeRoutingWithOperations: boolean;
  /**
   * True when the product has both an ACTIVE, non-empty BOM version and an
   * ACTIVE, non-empty routing. This gates the UI's run button and is an
   * advisor; the readiness engine remains the authority on readiness and still
   * evaluates every existing-and-owned tuple, DRAFT or not, fail-safe.
   */
  isConfigured: boolean;
  /** What is still missing, in remediation order. Empty when configured. */
  missing: ConfigurationGap[];
}

/**
 * Pure derivation of the configuration status. Kept separate (and dependency
 * free) so the rule is unit-testable and so the UI never has to re-derive it.
 */
export function deriveConfiguration(state: {
  bomVersions: number;
  routings: number;
  activeBoms: number;
  activeBomsWithRequiredItems: number;
  activeRoutings: number;
  activeRoutingsWithOperations: number;
}): ProductConfiguration {
  const missing: ConfigurationGap[] = [];

  if (state.bomVersions < 1 || state.activeBoms < 1) {
    missing.push("ACTIVE_BOM");
  } else if (state.activeBomsWithRequiredItems < 1) {
    missing.push("BOM_REQUIRED_ITEMS");
  }

  if (state.routings < 1 || state.activeRoutings < 1) {
    missing.push("ACTIVE_ROUTING");
  } else if (state.activeRoutingsWithOperations < 1) {
    missing.push("ROUTING_OPERATIONS");
  }

  return {
    hasBom: state.bomVersions > 0,
    hasRouting: state.routings > 0,
    activeBomWithRequiredItems: state.activeBomsWithRequiredItems > 0,
    activeRoutingWithOperations: state.activeRoutingsWithOperations > 0,
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

const listItemInclude = {
  _count: { select: { bomVersions: true, routings: true, readinessChecks: true } },
  // Status-aware derivation needs to know whether ACTIVE versions exist and
  // whether they are non-empty, not just how many rows exist in total.
  bomVersions: {
    where: { status: "ACTIVE" },
    select: { _count: { select: { items: { where: { isRequired: true } } } } },
  },
  routings: {
    where: { status: "ACTIVE" },
    select: { _count: { select: { operations: true } } },
  },
} as const;

type ProductWithConfigurationLinks = Prisma.ProductGetPayload<{
  include: typeof listItemInclude;
}>;

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
      include: listItemInclude,
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
      include: listItemInclude,
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
    product: ProductWithConfigurationLinks,
    latest?: { productId: string; status: ReadinessCheckStatus; score: number } | null
  ): ProductListItem {
    const activeBoms = product.bomVersions;
    const activeRoutings = product.routings;
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      _count: {
        bomVersions: product._count.bomVersions,
        routings: product._count.routings,
        readinessChecks: product._count.readinessChecks,
      },
      configuration: deriveConfiguration({
        bomVersions: product._count.bomVersions,
        routings: product._count.routings,
        activeBoms: activeBoms.length,
        activeBomsWithRequiredItems: activeBoms.filter((b) => b._count.items > 0).length,
        activeRoutings: activeRoutings.length,
        activeRoutingsWithOperations: activeRoutings.filter((r) => r._count.operations > 0).length,
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
}