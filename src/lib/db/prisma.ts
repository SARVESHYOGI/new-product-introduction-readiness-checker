import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPgPoolConfig, resolveDatabaseUrl } from "@/lib/db/config";

function createPrismaClient(): PrismaClient {
  // Explicit PoolConfig rather than `{ connectionString }`: Prisma 7's pg
  // adapter does not reliably apply `sslmode` from a connection string, so a
  // remote (Vercel) database that requires TLS fails to connect. See
  // src/lib/db/config.ts.
  const adapter = new PrismaPg(createPgPoolConfig(resolveDatabaseUrl()));
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot reloads.
const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

function resolveClient(): PrismaClient {
  if (!globalForPrisma.prismaClient) {
    globalForPrisma.prismaClient = createPrismaClient();
  }
  return globalForPrisma.prismaClient;
}

/**
 * The shared Prisma client, created on first use.
 *
 * Construction is deferred on purpose. Building eagerly at import time means a
 * missing or malformed DATABASE_URL throws while the module graph loads, which
 * escapes the route handler's error boundary and surfaces as an opaque framework
 * 500. Deferring it keeps the failure inside the request, where
 * `classifyInfrastructureError` can turn it into an actionable 503.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolveClient();
    const value = Reflect.get(client, property) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Close the pool. Used by tests and graceful shutdown paths. */
export async function disconnectPrisma(): Promise<void> {
  const client = globalForPrisma.prismaClient;
  if (!client) return;
  await client.$disconnect().catch(() => undefined);
  globalForPrisma.prismaClient = undefined;
}
