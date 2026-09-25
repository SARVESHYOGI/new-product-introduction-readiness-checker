import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { LineService } from "@/modules/lines/service";

export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const lines = await new LineService().list(includeInactive);
  return ok({ lines });
});