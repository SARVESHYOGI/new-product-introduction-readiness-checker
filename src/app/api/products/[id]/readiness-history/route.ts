import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { ProductService } from "@/modules/products/service";
import { ReadinessService } from "@/modules/readiness/service";
import { serializeCheck } from "@/modules/readiness/serialization";

export const GET = withRequestLog(async (req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const product = await new ProductService().getById(id);
  if (!product) return notFoundResponse("Product", id);

  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 20;

  const checks = await new ReadinessService().getHistory(id, limit);
  return ok({ checks: checks.map(serializeCheck) });
});