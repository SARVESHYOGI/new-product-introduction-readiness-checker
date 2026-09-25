import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite } from "@/lib/api/config-writes";
import { assignmentCreateSchema } from "@/lib/validation/schemas";
import { OperatorService } from "@/modules/operators/service";

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, assignmentCreateSchema);
  const operatorId = await requiredParam(ctx, "id");
  const { assignment, conflicts } = await new OperatorService().addAssignment(
    operatorId,
    input,
    user.id
  );
  return ok({ assignment, conflicts }, { status: 201 });
});
