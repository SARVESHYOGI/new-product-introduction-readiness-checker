import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite } from "@/lib/api/config-writes";
import { routingOperationCreateSchema } from "@/lib/validation/schemas";
import { RoutingService } from "@/modules/routing/service";

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, routingOperationCreateSchema);
  const routingId = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new RoutingService().addOperation(
    routingId,
    input,
    user.id
  );
  return ok({ operation: entity, conflicts }, { status: 201 });
});
