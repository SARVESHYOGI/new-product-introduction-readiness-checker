import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite, requireAdmin } from "@/lib/api/config-writes";
import { identifierRangeUpdateSchema } from "@/lib/validation/schemas";
import { InventoryService } from "@/modules/inventory/service";

/**
 * A single serial range. The product id in the path is authoritative: a range
 * belonging to another product is reported as 404 rather than edited, so a
 * crafted URL cannot mutate configuration outside the product it names.
 */
export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const productId = await requiredParam(ctx, "id");
  const rangeId = await requiredParam(ctx, "rangeId");
  const range = await new InventoryService().getRange(productId, rangeId);
  return ok({ range });
});

export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, identifierRangeUpdateSchema);
  const productId = await requiredParam(ctx, "id");
  const rangeId = await requiredParam(ctx, "rangeId");
  const { entity, conflicts } = await new InventoryService().updateRange(
    productId,
    rangeId,
    input,
    user.id
  );
  return ok({ range: entity, conflicts });
});

export const DELETE = withRequestLog(async (_req, ctx) => {
  const user = await requireAdmin();
  const productId = await requiredParam(ctx, "id");
  const rangeId = await requiredParam(ctx, "rangeId");
  await new InventoryService().removeRange(productId, rangeId, user.id);
  return ok({ deleted: true });
});
