import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@/generated/prisma/client";

export const SESSION_COOKIE = "npi_session";

const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_DAYS ?? 7) || 7) * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

async function cookieStore() {
  return cookies();
}

/**
 * Create a database-backed session for the user and set the HttpOnly cookie.
 * Only the SHA-256 hash of the token is persisted so a leaked database cannot
 * be used to impersonate users.
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const store = await cookieStore();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

/**
 * Resolve the current user from the session cookie (secure, database-backed).
 * Returns null when there is no session, it is expired, or the user is inactive.
 */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookieStore();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    // Clean up expired sessions lazily.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;

  return session.user;
}

export async function destroySession(): Promise<void> {
  const store = await cookieStore();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}