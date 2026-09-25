import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite, requireAdmin } from "@/lib/api/config-writes";
import { bomItemUpdateSchema } from "@/lib/validation/schemas";
import { BomService } from "@/modules/bom/service";

export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, bomItemUpdateSchema);
  const bomVersionId = await requiredParam(ctx, "id");
  const itemId = await requiredParam(ctx, "itemId");
  const { entity, conflicts } = await new BomService().updateItem(
    bomVersionId,
    itemId,
    input,
    user.id
  );
  return ok({ item: entity, conflicts });
});

/**
 * BOM items are children of a version with no independent audit history, so
 * they can be removed outright. The removal itself is audited. (The BOM version
 * itself is never deleted — see `/api/boms/[id]`.)
 */
export const DELETE = withRequestLog(async (_req, ctx) => {
  const user = await requireAdmin();
  const bomVersionId = await requiredParam(ctx, "id");
  const itemId = await requiredParam(ctx, "itemId");
  await new BomService().removeItem(bomVersionId, itemId, user.id);
  return ok({ deleted: true });
});
