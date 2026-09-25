import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { operatorUpdateSchema } from "@/lib/validation/schemas";
import { OperatorService } from "@/modules/operators/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const operator = await new OperatorService().getById(id);
  if (!operator) return notFoundResponse("Operator", id);
  return ok({ operator });
});

/**
 * Operators are master data referenced by historical assignments and readiness
 * results, so they are never deleted — an operator who leaves is set to
 * INACTIVE, which the readiness engine treats as ineligible.
 */
export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, operatorUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const operator = await new OperatorService().update(id, input, user.id);
  return ok({ operator });
});
