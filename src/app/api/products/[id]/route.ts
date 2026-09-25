import { withRequestLog, ok, notFoundResponse, requiredParam } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite, requireAdmin } from "@/lib/api/config-writes";
import { productUpdateSchema } from "@/lib/validation/schemas";
import { ProductService } from "@/modules/products/service";

export const GET = withRequestLog(async (_req, ctx) => {
  await requireUser();
  const id = await requiredParam(ctx, "id");
  const product = await new ProductService().getById(id);
  if (!product) return notFoundResponse("Product", id);
  return ok({ product });
});

export const PATCH = withRequestLog(async (req, ctx) => {
  const { user, input } = await adminWrite(req, productUpdateSchema);
  const id = await requiredParam(ctx, "id");
  const product = await new ProductService().update(id, input, user.id);
  return ok({ product });
});

export const DELETE = withRequestLog(async (_req, ctx) => {
  const user = await requireAdmin();
  const id = await requiredParam(ctx, "id");
  await new ProductService().delete(id, user.id);
  return ok({ deleted: true });
});
