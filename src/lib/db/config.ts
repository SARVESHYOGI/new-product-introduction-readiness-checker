import type { PoolConfig } from "pg";

/**
 * Runtime PostgreSQL configuration.
 *
 * Prisma 7's pg adapter does not reliably apply the `sslmode` query parameter
 * when it is given a connection string. That is especially problematic on
 * Vercel, where the database is remote and normally requires TLS. We therefore
 * parse the URL and pass explicit PoolConfig fields to the adapter. The URL is
 * never included in an error message or log record.
 */

const DEFAULT_CONNECTION_TIMEOUT_MS = 8_000;
const DEFAULT_POOL_MAX = 5;
const MAX_CONNECTION_TIMEOUT_MS = 60_000;
const MAX_POOL_MAX = 20;

export const DATABASE_CONFIGURATION_ERROR = "DATABASE_CONFIGURATION_ERROR" as const;

type Environment = Record<string, string | undefined>;

export class DatabaseConfigurationError extends Error {
  readonly code = DATABASE_CONFIGURATION_ERROR;

  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

/** Resolve the application database without ever echoing its value. */
export function resolveDatabaseUrl(environment: Environment = process.env): string {
  const value = environment.DATABASE_URL ?? environment.TEST_DATABASE_URL;
  if (!value || value.trim().length === 0) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is not configured. Set it to a PostgreSQL connection string."
    );
  }
  return value.trim();
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  maximum: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new DatabaseConfigurationError(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

function decodeUrlPart(value: string, name: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new DatabaseConfigurationError(`DATABASE_URL contains an invalid ${name}.`);
  }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

function resolveSsl(url: URL, environment: Environment): PoolConfig["ssl"] {
  const configured = environment.DATABASE_SSL?.trim().toLowerCase();
  const fromUrl = url.searchParams.get("sslmode")?.trim().toLowerCase();
  const mode = configured || fromUrl || (isLocalHost(url.hostname) ? "disable" : "require");

  if (mode === "disable" || mode === "false" || mode === "0") return false;
  if (mode === "allow" || mode === "prefer" || mode === "no-verify") {
    return { rejectUnauthorized: false };
  }
  if (mode === "require" || mode === "true" || mode === "1") {
    // Managed PostgreSQL providers commonly use a certificate chain that is not
    // present in the Vercel runtime trust store. TLS is still enabled; operators
    // can opt into certificate verification with verify-ca/verify-full.
    return { rejectUnauthorized: false };
  }
  if (mode === "verify-ca" || mode === "verify-full") {
    return { rejectUnauthorized: true };
  }

  throw new DatabaseConfigurationError(
    "DATABASE_SSL must be disable, require, verify-ca, or verify-full."
  );
}

/**
 * Build an explicit `pg` PoolConfig for PrismaPg.
 *
 * Explicit fields are intentional: they avoid the Prisma 7 adapter-pg bug
 * where a remote connection string without `sslmode` times out even when the
 * server requires TLS.
 */
export function createPgPoolConfig(
  connectionString: string,
  environment: Environment = process.env
): PoolConfig {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseConfigurationError("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new DatabaseConfigurationError("DATABASE_URL must use a PostgreSQL protocol.");
  }
  if (!url.hostname) {
    throw new DatabaseConfigurationError("DATABASE_URL must include a database host.");
  }

  const database = decodeUrlPart(url.pathname.replace(/^\//, ""), "database name");
  if (!database) {
    throw new DatabaseConfigurationError("DATABASE_URL must include a database name.");
  }

  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new DatabaseConfigurationError("DATABASE_URL contains an invalid database port.");
  }

  const pgbouncer = url.searchParams.get("pgbouncer") === "true";
  const max = boundedInteger(
    environment.DATABASE_POOL_MAX,
    pgbouncer ? 1 : DEFAULT_POOL_MAX,
    "DATABASE_POOL_MAX",
    MAX_POOL_MAX
  );
  const connectionTimeoutMillis = boundedInteger(
    environment.DATABASE_CONNECTION_TIMEOUT_MS,
    DEFAULT_CONNECTION_TIMEOUT_MS,
    "DATABASE_CONNECTION_TIMEOUT_MS",
    MAX_CONNECTION_TIMEOUT_MS
  );

  const config: PoolConfig = {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port,
    database,
    connectionTimeoutMillis,
    max,
    idleTimeoutMillis: 10_000,
    application_name: "npi-readiness",
  };

  const user = decodeUrlPart(url.username, "username");
  const password = decodeUrlPart(url.password, "password");
  if (user) config.user = user;
  if (password) config.password = password;

  const ssl = resolveSsl(url, environment);
  if (ssl !== undefined) config.ssl = ssl;

  return config;
}
