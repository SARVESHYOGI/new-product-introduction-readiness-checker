import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { adminWrite } from "@/lib/api/config-writes";
import { inventoryItemCreateSchema } from "@/lib/validation/schemas";
import { InventoryService } from "@/modules/inventory/service";

export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? undefined;
  const items = await new InventoryService().listItems({ productId });
  return ok({ items });
});

export const POST = withRequestLog(async (req) => {
  const { user, input } = await adminWrite(req, inventoryItemCreateSchema);
  const { entity } = await new InventoryService().createItem(input, user.id);
  return ok({ item: entity }, { status: 201 });
});
