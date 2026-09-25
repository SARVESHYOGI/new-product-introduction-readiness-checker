import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { bomVersionCreateSchema } from "@/lib/validation/schemas";
import { ProductService } from "@/modules/products/service";
import { BomService } from "@/modules/bom/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const product = await new ProductService().getById(id);
  if (!product) return notFoundResponse("Product", id);

  const boms = await new BomService().listByProduct(id);
  return ok({ boms });
});

export const POST = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, bomVersionCreateSchema);
  const productId = await requiredParam(ctx, "id");
  const { entity, conflicts } = await new BomService().create(productId, input, user.id);
  return ok({ bom: entity, conflicts }, { status: 201 });
});
