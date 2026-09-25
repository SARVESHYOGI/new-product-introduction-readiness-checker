/**
 * Auth constants with no runtime dependencies.
 *
 * This module is imported by `src/proxy.ts`, which runs on the Edge runtime.
 * It must therefore stay free of `node:crypto`, Prisma, and `pg`: importing
 * `@/lib/auth/session` from the proxy would drag the whole database stack into
 * the middleware bundle for a single string.
 */
export const SESSION_COOKIE = "npi_session";
