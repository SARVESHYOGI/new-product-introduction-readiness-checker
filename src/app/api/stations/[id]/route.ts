import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { stationUpdateSchema } from "@/lib/validation/schemas";
import { StationService } from "@/modules/stations/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const station = await new StationService().getById(id);
  if (!station) return notFoundResponse("Station", id);
  return ok({ station });
});

/** No DELETE: stations are referenced by routings and readiness history. */
export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, stationUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const station = await new StationService().update(id, input, user.id);
  return ok({ station });
});
