import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { operatorCreateSchema } from "@/lib/validation/schemas";
import { OperatorService } from "@/modules/operators/service";

export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const operators = await new OperatorService().list(includeInactive);
  return ok({ operators });
});

export const POST = withRequestLog(async (req) => {
  const { user, input } = await adminWrite(req, operatorCreateSchema);
  const operator = await new OperatorService().create(input, user.id);
  return ok({ operator }, { status: 201 });
});
