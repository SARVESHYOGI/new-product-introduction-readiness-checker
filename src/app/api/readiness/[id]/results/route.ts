import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { ReadinessService } from "@/modules/readiness/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const results = await new ReadinessService().getResults(id);
  const check = await new ReadinessService().getCheck(id);
  return ok({ results, checkId: id, status: check?.status ?? null });
});