import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { routingUpdateSchema } from "@/lib/validation/schemas";
import { RoutingService } from "@/modules/routing/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const routing = await new RoutingService().getById(id);
  if (!routing) return notFoundResponse("Routing", id);
  return ok({ routing });
});

/** No DELETE: supersede with `{ "status": "OBSOLETE" }` to preserve history. */
export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, routingUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new RoutingService().update(id, input, user.id);
  return ok({ routing: entity, conflicts });
});
