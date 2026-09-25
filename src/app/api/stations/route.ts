import { withRequestLog, ok, enumQueryParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { stationCreateSchema } from "@/lib/validation/schemas";
import { StationService } from "@/modules/stations/service";

const STATION_STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"] as const;

/**
 * Lists every station regardless of status.
 *
 * A configuration editor must be able to see and fix INACTIVE and MAINTENANCE
 * stations — those are exactly the states that make a readiness check BLOCKED,
 * so filtering them out would hide the problem the engineer needs to solve.
 * Pass `?lineId=` or `?status=` to narrow.
 */
export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const lineId = url.searchParams.get("lineId") ?? undefined;
  const stations = await new StationService().list({
    lineId,
    status: enumQueryParam(req, "status", STATION_STATUSES),
  });
  return ok({ stations });
});

export const POST = withRequestLog(async (req) => {
  const { user, input } = await adminWrite(req, stationCreateSchema);
  const station = await new StationService().create(input, user.id);
  return ok({ station }, { status: 201 });
});
