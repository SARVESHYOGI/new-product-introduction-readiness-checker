import { withRequestLog, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { WorkInstructionService } from "@/modules/work-instructions/service";

/**
 * Lists all work-instruction versions so the configuration editor can show an
 * operation's current version alongside obsolete ones. Work instructions are
 * never filtered by lifecycle status: seeing the superseded version is what
 * helps an engineer understand why a current operation is not ready.
 */
export const GET = withRequestLog(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? undefined;
  const routingOperationId = url.searchParams.get("routingOperationId") ?? undefined;

  const instructions = await new WorkInstructionService().list({
    productId,
    routingOperationId,
  });
  return ok({ instructions });
});
