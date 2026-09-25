import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite, requireAdmin } from "@/lib/api/config-writes";
import { routingOperationUpdateSchema } from "@/lib/validation/schemas";
import { RoutingService } from "@/modules/routing/service";

export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, routingOperationUpdateSchema);
  const routingId = await requiredParam(ctx, "id");
  const operationId = await requiredParam(ctx, "operationId");
  const { entity, conflicts } = await new RoutingService().updateOperation(
    routingId,
    operationId,
    input,
    user.id
  );
  return ok({ operation: entity, conflicts });
});

export const DELETE = withRequestLog(async (_req, ctx) => {
  const user = await requireAdmin();
  const routingId = await requiredParam(ctx, "id");
  const operationId = await requiredParam(ctx, "operationId");
  await new RoutingService().removeOperation(routingId, operationId, user.id);
  return ok({ deleted: true });
});
