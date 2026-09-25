import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { ProductService } from "@/modules/products/service";
import { RoutingService } from "@/modules/routing/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const product = await new ProductService().getById(id);
  if (!product) return notFoundResponse("Product", id);

  const routings = await new RoutingService().listByProduct(id);
  return ok({ routings });
});