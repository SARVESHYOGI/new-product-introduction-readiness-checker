import { withRequestLog, ok, fail, readJsonBody, loginRateLimiter, clientIp } from "@/lib/api/http";
import { ApiError } from "@/lib/errors";
import { AuthService } from "@/modules/auth/service";

export const POST = withRequestLog(async (req) => {
  const key = `login:${clientIp(req)}`;
  if (!loginRateLimiter.allow(key)) {
    return fail(ApiError.tooManyRequests());
  }

  const body = await readJsonBody<unknown>(req);
  const user = await new AuthService().login(body);
  return ok({ user }, { status: 200 });
});