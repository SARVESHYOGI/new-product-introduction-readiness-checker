import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite } from "@/lib/api/config-writes";
import { inventoryItemUpdateSchema } from "@/lib/validation/schemas";
import { InventoryService } from "@/modules/inventory/service";

/**
 * Inventory items are shared master data: deleting one would silently drop it
 * from every product that maps to it, and historical readiness results still
 * reference it. Lifecycle is therefore a status change (ACTIVE/INACTIVE) rather
 * than a delete — see README "What can be deleted".
 */
export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, inventoryItemUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new InventoryService().updateItem(id, input, user.id);
  return ok({ item: entity, conflicts });
});
