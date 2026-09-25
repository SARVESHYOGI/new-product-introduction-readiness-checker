import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { DashboardService } from "@/modules/dashboard/service";

export const GET = withRequestLog(async () => {
  await requireUser();
  const stats = await new DashboardService().getStats();
  return ok({ stats });
});