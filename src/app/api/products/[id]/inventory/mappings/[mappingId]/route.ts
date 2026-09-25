import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite, requireAdmin } from "@/lib/api/config-writes";
import { inventoryMappingUpdateSchema } from "@/lib/validation/schemas";
import { InventoryService } from "@/modules/inventory/service";

export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, inventoryMappingUpdateSchema);
  const productId = await requiredParam(ctx, "id");
  const mappingId = await requiredParam(ctx, "mappingId");
  const { entity, conflicts } = await new InventoryService().updateMapping(
    productId,
    mappingId,
    input,
    user.id
  );
  return ok({ mapping: entity, conflicts });
});

export const DELETE = withRequestLog(async (_req, ctx) => {
  const user = await requireAdmin();
  const productId = await requiredParam(ctx, "id");
  const mappingId = await requiredParam(ctx, "mappingId");
  const { conflicts } = await new InventoryService().removeMapping(productId, mappingId, user.id);
  return ok({ deleted: true, conflicts });
});
