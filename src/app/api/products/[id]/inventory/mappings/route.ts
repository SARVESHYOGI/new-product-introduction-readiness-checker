import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite } from "@/lib/api/config-writes";
import { inventoryMappingCreateSchema } from "@/lib/validation/schemas";
import { InventoryService } from "@/modules/inventory/service";

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, inventoryMappingCreateSchema);
  const productId = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new InventoryService().createMapping(
    productId,
    input,
    user.id
  );
  return ok({ mapping: entity, conflicts }, { status: 201 });
});
