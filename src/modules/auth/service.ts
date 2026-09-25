import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth/guard";
import { createSession, destroySession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { parseOrThrow, loginSchema } from "@/lib/validation/schemas";

/**
 * Authentication service. Sessions are database-backed (SHA-256 token hash,
 * HttpOnly cookie); passwords are scrypt-hashed with an application pepper.
 */
export class AuthService {
  async login(input: unknown): Promise<AuthUser> {
    const { email, password } = parseOrThrow(loginSchema, input);
    const normalized = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(
        "INVALID_CREDENTIALS",
        "Invalid email or password."
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized(
        "INVALID_CREDENTIALS",
        "Invalid email or password."
      );
    }

    await createSession(user.id);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async logout(): Promise<void> {
    await destroySession();
  }
}