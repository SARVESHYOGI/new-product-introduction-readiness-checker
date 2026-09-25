import { withRequestLog, ok, fail, readJsonBody } from "@/lib/api/http";
import { ApiError } from "@/lib/errors";
import { requireUser, isAdmin } from "@/lib/auth/guard";
import { parseOrThrow, productCreateSchema } from "@/lib/validation/schemas";
import { ProductService } from "@/modules/products/service";

export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);

  const products = await new ProductService().list({
    search,
    status: (status as "DRAFT" | "ACTIVE" | "INACTIVE" | undefined) ?? undefined,
    limit: Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 100,
  });
  return ok({ products });
});

export const POST = withRequestLog(async (req) => {
  const user = await requireUser();
  if (!isAdmin(user)) {
    return fail(
      ApiError.forbidden("FORBIDDEN", "Only administrators can create products.")
    );
  }

  const body = await readJsonBody<unknown>(req);
  const input = parseOrThrow(productCreateSchema, body);
  const product = await new ProductService().create(input, user.id);
  return ok({ product }, { status: 201 });
});