import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";

export const GET = withRequestLog(async () => {
  const user = await requireUser();
  return ok({ user });
});