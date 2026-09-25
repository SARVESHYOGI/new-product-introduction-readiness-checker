import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { ReadinessService } from "@/modules/readiness/service";
import { serializeCheck } from "@/modules/readiness/serialization";

export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 20;

  const checks = await new ReadinessService().listRecent(limit);
  return ok({ checks: checks.map(serializeCheck) });
});