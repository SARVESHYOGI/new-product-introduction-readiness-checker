import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { adminWrite, requireAdmin } from "@/lib/api/config-writes";
import { assignmentUpdateSchema } from "@/lib/validation/schemas";
import { OperatorService } from "@/modules/operators/service";

/**
 * Revoke or re-date an existing assignment. Without this, a mistake (wrong
 * station, wrong window) could only be fixed by deleting the row, which loses the
 * record that the assignment existed at all.
 */
export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, assignmentUpdateSchema);
  const operatorId = await requiredParam(ctx, "id");
  const assignmentId = await requiredParam(ctx, "assignmentId");
  const { assignment, conflicts } = await new OperatorService().updateAssignment(
    operatorId,
    assignmentId,
    input,
    user.id
  );
  return ok({ assignment, conflicts });
});

/** Assignments are one of the few removable records: the window was wrong. */
export const DELETE = withRequestLog(async (_req, ctx) => {
  const user = await requireAdmin();
  const operatorId = await requiredParam(ctx, "id");
  const assignmentId = await requiredParam(ctx, "assignmentId");
  await new OperatorService().removeAssignment(operatorId, assignmentId, user.id);
  return ok({ deleted: true });
});
