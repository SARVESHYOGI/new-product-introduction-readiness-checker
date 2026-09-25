import { withRequestLog, ok, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { workInstructionCreateSchema } from "@/lib/validation/schemas";
import { WorkInstructionService } from "@/modules/work-instructions/service";

export const GET = withRequestLog(async (req, ctx) => {
  await requireUser();
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? undefined;
  const operationId = await requiredParam(ctx, "operationId");
  const instructions = await new WorkInstructionService().list({ productId, routingOperationId: operationId });
  return ok({ instructions });
});

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, workInstructionCreateSchema);
  const operationId = await requiredParam(ctx, "operationId");
  const { entity, conflicts } = await new WorkInstructionService().create(
    operationId,
    input,
    user.id
  );
  return ok({ instruction: entity, conflicts }, { status: 201 });
});
