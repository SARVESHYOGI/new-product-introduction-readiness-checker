import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { ProductService } from "@/modules/products/service";
import { InventoryService } from "@/modules/inventory/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const productId = await requiredParam(ctx, "id");
  const product = await new ProductService().getById(productId);
  if (!product) return notFoundResponse("Product", productId);

  // One round trip for the product-scoped panel. The candidate inventory items
  // come from /api/inventory-items, which is shared master data and already
  // cached separately — recomputing "unmapped" items here would ship the whole
  // catalogue on every product page load for a list the panel does not need.
  const [mappings, ranges] = await Promise.all([
    new InventoryService().listMappings(productId),
    new InventoryService().listRanges(productId),
  ]);

  return ok({ mappings, ranges });
});
