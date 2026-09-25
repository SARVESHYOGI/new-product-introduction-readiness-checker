import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { ReadinessService } from "@/modules/readiness/service";
import { serializeCheck } from "@/modules/readiness/serialization";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const check = await new ReadinessService().getCheck(id);
  if (!check) return notFoundResponse("Readiness check", id);
  return ok({ check: serializeCheck(check) });
});