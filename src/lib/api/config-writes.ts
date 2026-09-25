import type { z } from "zod";
import { readJsonBody } from "@/lib/api/http";
import { requireUser, type AuthUser } from "@/lib/auth/guard";
import { parseOrThrow } from "@/lib/validation/schemas";

/**
 * Shared preamble for every configuration write route.
 *
 * All configuration mutation is ADMIN-only (Engineer runs checks, Viewer reads;
 * see `lib/auth/guard`). Centralising the guard + Zod parse here means a new
 * route cannot accidentally ship without one — the pattern is
 * `const { user, input } = await adminWrite(req, schema);`, and it is impossible
 * to forget the role check because the helper performs it.
 */
export async function adminWrite<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ user: AuthUser; input: T }> {
  const user = await requireUser(["ADMIN"]);
  const body = await readJsonBody<unknown>(req);
  return { user, input: parseOrThrow(schema, body) };
}

/** Guard for write routes that need no request body (e.g. a DELETE). */
export function requireAdmin(): Promise<AuthUser> {
  return requireUser(["ADMIN"]);
}
