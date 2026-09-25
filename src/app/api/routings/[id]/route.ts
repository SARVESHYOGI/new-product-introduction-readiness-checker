import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { RoutingService } from "@/modules/routing/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const routing = await new RoutingService().getById(id);
  if (!routing) return notFoundResponse("Routing", id);
  return ok({ routing });
});