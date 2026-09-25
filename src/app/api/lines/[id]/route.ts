import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { lineUpdateSchema } from "@/lib/validation/schemas";
import { LineService } from "@/modules/lines/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const line = await new LineService().getById(id);
  if (!line) return notFoundResponse("Line", id);
  return ok({ line });
});

/** No DELETE: lines are referenced by stations and readiness history. */
export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, lineUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const line = await new LineService().update(id, input, user.id);
  return ok({ line });
});
