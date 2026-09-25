import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env and set DATABASE_URL."
    );
  }
  return url;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot reloads.
const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

export const prisma = globalForPrisma.prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prisma;
}