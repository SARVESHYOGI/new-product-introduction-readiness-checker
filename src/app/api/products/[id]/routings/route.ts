import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { routingCreateSchema } from "@/lib/validation/schemas";
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

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, routingCreateSchema);
  const productId = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new RoutingService().create(productId, input, user.id);
  return ok({ routing: entity, conflicts }, { status: 201 });
});
