import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite } from "@/lib/api/config-writes";
import { bomItemCreateSchema } from "@/lib/validation/schemas";
import { BomService } from "@/modules/bom/service";

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, bomItemCreateSchema);
  const bomVersionId = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new BomService().addItem(bomVersionId, input, user.id);
  return ok({ item: entity, conflicts }, { status: 201 });
});
