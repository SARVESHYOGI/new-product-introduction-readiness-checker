import { withRequestLog, ok } from "@/lib/api/http";
import { AuthService } from "@/modules/auth/service";

export const POST = withRequestLog(async () => {
  await new AuthService().logout();
  return ok({ success: true });
});