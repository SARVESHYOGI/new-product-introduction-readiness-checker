import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { BomService } from "@/modules/bom/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const bom = await new BomService().getById(id);
  if (!bom) return notFoundResponse("BOM", id);
  return ok({ bom });
});