import { withRequestLog, ok, fail, readJsonBody, readinessRateLimiter, clientIp } from "@/lib/api/http";
import { ApiError } from "@/lib/errors";
import { requireUser, canRunReadinessChecks } from "@/lib/auth/guard";
import { ReadinessService } from "@/modules/readiness/service";
import { serializeCheck } from "@/modules/readiness/serialization";

export const POST = withRequestLog(async (req) => {
  const user = await requireUser();
  if (!canRunReadinessChecks(user)) {
    return fail(
      ApiError.forbidden(
        "FORBIDDEN",
        "Only engineers and administrators can run readiness checks."
      )
    );
  }

  const key = `readiness:${clientIp(req)}`;
  if (!readinessRateLimiter.allow(key)) {
    return fail(ApiError.tooManyRequests());
  }

  const body = await readJsonBody<unknown>(req);
  const service = new ReadinessService();
  const check = await service.runCheck(body, user);
  return ok({ check: serializeCheck(check) }, { status: 201 });
});