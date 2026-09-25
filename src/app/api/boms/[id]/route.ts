import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { bomVersionUpdateSchema } from "@/lib/validation/schemas";
import { BomService } from "@/modules/bom/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const bom = await new BomService().getById(id);
  if (!bom) return notFoundResponse("BOM", id);
  return ok({ bom });
});

/**
 * PATCH is the only mutation on a BOM version. There is no DELETE by design:
 * `ReadinessCheck.bomVersionId` is `onDelete: Restrict`, so a version that has
 * been checked against must remain readable forever. Supersede it with
 * `{ "status": "OBSOLETE" }` instead.
 */
export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, bomVersionUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new BomService().update(id, input, user.id);
  return ok({ bom: entity, conflicts });
});
