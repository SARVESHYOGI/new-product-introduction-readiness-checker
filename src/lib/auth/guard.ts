import { getSessionUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/errors";
import type { User, UserRole } from "@/generated/prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Server-side authorization for route handlers and server components.
 * Never rely on client-side role checks: every protected endpoint verifies
 * the session and role here, close to the data.
 */
export async function requireUser(roles?: UserRole[]): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) {
    throw ApiError.unauthorized();
  }
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw ApiError.forbidden(
      "FORBIDDEN",
      `This action requires the ${roles.join(" or ")} role.`
    );
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export const isAdmin = (user: Pick<User, "role">): boolean => user.role === "ADMIN";
export const canRunReadinessChecks = (user: Pick<User, "role">): boolean =>
  user.role === "ADMIN" || user.role === "ENGINEER";
export const canView = (): boolean => true;