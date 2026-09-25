import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { lineCreateSchema } from "@/lib/validation/schemas";
import { LineService } from "@/modules/lines/service";

export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const lines = await new LineService().list(includeInactive);
  return ok({ lines });
});

export const POST = withRequestLog(async (req) => {
  const { user, input } = await adminWrite(req, lineCreateSchema);
  const line = await new LineService().create(input, user.id);
  return ok({ line }, { status: 201 });
});
