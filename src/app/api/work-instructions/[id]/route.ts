import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite, requireAdmin } from "@/lib/api/config-writes";
import { workInstructionUpdateSchema } from "@/lib/validation/schemas";
import { WorkInstructionService } from "@/modules/work-instructions/service";
import { ApiError } from "@/lib/errors";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const instruction = await new WorkInstructionService().getById(id);
  if (!instruction) {
    throw ApiError.notFound("NOT_FOUND", `Work instruction ${id} was not found.`);
  }
  return ok({ instruction });
});

export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, workInstructionUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new WorkInstructionService().update(id, input, user.id);
  return ok({ instruction: entity, conflicts });
});

/**
 * Delete is restricted to DRAFT instructions. An ACTIVE instruction must be
 * superseded by creating a new version and obsoleting the old one, so the
 * version history an operator was trained against is never silently removed.
 */
export const DELETE = withRequestLog(async (_req, ctx) => {
  const user = await requireAdmin();
  const id = await requiredParam(ctx, "id");
  await new WorkInstructionService().remove(id, user.id);
  return ok({ deleted: true });
});
