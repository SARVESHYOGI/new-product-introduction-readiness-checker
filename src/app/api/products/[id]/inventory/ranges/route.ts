import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { identifierRangeCreateSchema } from "@/lib/validation/schemas";
import { InventoryService } from "@/modules/inventory/service";

/** List every serial range configured for the product. */
export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const productId = await requiredParam(ctx, "id");
  const ranges = await new InventoryService().listRanges(productId);
  return ok({ ranges });
});

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, identifierRangeCreateSchema);
  const productId = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new InventoryService().createRange(
    productId,
    input,
    user.id
  );
  return ok({ range: entity, conflicts }, { status: 201 });
});
