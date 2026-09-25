/**
 * Shared vitest setup.
 *
 * - Loads .env (unit tests do not touch the database, but modules resolve
 *   connection strings at import time, so point the Prisma singleton at the
 *   dedicated TEST database for anything that does).
 * - Silences noisy structured logging during tests unless LOG_LEVEL=debug.
 */
import "dotenv/config";
import "@testing-library/jest-dom/vitest";
import { afterAll } from "vitest";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "warn";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-only-secret-for-vitest";

afterAll(async () => {
  // Ensures the shared Prisma client is closed before the process exits so
  // vitest can terminate cleanly after integration tests.
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.$disconnect().catch(() => undefined);
});