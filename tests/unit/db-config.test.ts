import { describe, expect, it } from "vitest";
import {
  createPgPoolConfig,
  DatabaseConfigurationError,
  resolveDatabaseUrl,
} from "@/lib/db/config";
import { AuthConfigurationError, resolveAuthSecret } from "@/lib/auth/config";

const LOCAL = "postgresql://app:secret@localhost:5432/npi_dev";

describe("resolveDatabaseUrl", () => {
  it("returns the configured URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it("trims surrounding whitespace from a pasted value", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: `  ${LOCAL}\n` })).toBe(LOCAL);
  });

  it("falls back to TEST_DATABASE_URL when DATABASE_URL is absent", () => {
    expect(resolveDatabaseUrl({ TEST_DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it("throws a configuration error when neither variable is set", () => {
    expect(() => resolveDatabaseUrl({})).toThrow(DatabaseConfigurationError);
  });

  it("throws on a blank value rather than handing an empty string to the driver", () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: "   " })).toThrow(
      DatabaseConfigurationError
    );
  });

  it("never repeats the URL value in the error message", () => {
    let message = "";
    try {
      resolveDatabaseUrl({ DATABASE_URL: "   " });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("secret");
    expect(message).toContain("DATABASE_URL");
  });
});

describe("createPgPoolConfig", () => {
  it("expands the connection string into explicit connection fields", () => {
    const config = createPgPoolConfig(LOCAL);

    expect(config.host).toBe("localhost");
    expect(config.port).toBe(5432);
    expect(config.database).toBe("npi_dev");
    expect(config.user).toBe("app");
    expect(config.password).toBe("secret");
  });

  it("defaults to port 5432 when the URL omits one", () => {
    expect(createPgPoolConfig("postgresql://app:secret@host/npi").port).toBe(5432);
  });

  it("percent-decodes credentials and database names", () => {
    const config = createPgPoolConfig(
      "postgresql://app:p%40ss%2Fword@db.example.com:5432/npi%20dev"
    );

    expect(config.user).toBe("app");
    expect(config.password).toBe("p@ss/word");
    expect(config.database).toBe("npi dev");
  });

  it("accepts a socket-style IPv6 host without brackets in the pool config", () => {
    const config = createPgPoolConfig("postgresql://app:secret@[2001:db8::1]:5432/npi");
    expect(config.host).toBe("2001:db8::1");
  });

  it("rejects a non-PostgreSQL protocol", () => {
    expect(() => createPgPoolConfig("mysql://root@host:3306/npi")).toThrow(
      DatabaseConfigurationError
    );
  });

  it("rejects a malformed URL", () => {
    expect(() => createPgPoolConfig("not-a-url")).toThrow(DatabaseConfigurationError);
  });

  it("rejects a URL with no database name", () => {
    expect(() => createPgPoolConfig("postgresql://app:secret@host:5432/")).toThrow(
      DatabaseConfigurationError
    );
  });

  it("rejects an out-of-range port", () => {
    expect(() => createPgPoolConfig("postgresql://app:secret@host:70000/npi")).toThrow(
      DatabaseConfigurationError
    );
  });
});

describe("createPgPoolConfig TLS", () => {
  it("disables TLS for localhost by default", () => {
    expect(createPgPoolConfig(LOCAL).ssl).toBe(false);
  });

  it("enables TLS for a remote host when sslmode is absent (Vercel case)", () => {
    const ssl = createPgPoolConfig("postgresql://u:p@db.neon.tech:5432/npi").ssl;
    expect(ssl).toEqual({ rejectUnauthorized: false });
  });

  it("keeps TLS enabled but skips chain verification for sslmode=require", () => {
    const ssl = createPgPoolConfig("postgresql://u:p@db.example.com/npi?sslmode=require")
      .ssl;
    expect(ssl).toEqual({ rejectUnauthorized: false });
  });

  it("verifies the certificate chain for verify-full", () => {
    const ssl = createPgPoolConfig("postgresql://u:p@db.example.com/npi?sslmode=verify-full")
      .ssl;
    expect(ssl).toEqual({ rejectUnauthorized: true });
  });

  it("lets DATABASE_SSL override the mode embedded in the URL", () => {
    const ssl = createPgPoolConfig("postgresql://u:p@db.example.com/npi?sslmode=require", {
      DATABASE_SSL: "disable",
    }).ssl;
    expect(ssl).toBe(false);
  });

  it("rejects an unrecognised DATABASE_SSL value instead of guessing", () => {
    expect(() =>
      createPgPoolConfig("postgresql://u:p@db.example.com/npi", { DATABASE_SSL: "maybe" })
    ).toThrow(DatabaseConfigurationError);
  });
});

describe("createPgPoolConfig pool sizing", () => {
  it("uses conservative serverless-friendly defaults", () => {
    const config = createPgPoolConfig(LOCAL);
    expect(config.max).toBe(5);
    expect(config.connectionTimeoutMillis).toBe(8000);
  });

  it("drops to a single connection behind a transaction pooler", () => {
    expect(createPgPoolConfig(`${LOCAL}?pgbouncer=true`).max).toBe(1);
  });

  it("honours explicit overrides", () => {
    const config = createPgPoolConfig(LOCAL, {
      DATABASE_POOL_MAX: "10",
      DATABASE_CONNECTION_TIMEOUT_MS: "1500",
    });
    expect(config.max).toBe(10);
    expect(config.connectionTimeoutMillis).toBe(1500);
  });

  it("rejects a non-numeric pool size", () => {
    expect(() =>
      createPgPoolConfig(LOCAL, { DATABASE_POOL_MAX: "many" })
    ).toThrow(DatabaseConfigurationError);
  });

  it("rejects a pool size above the hard ceiling", () => {
    expect(() => createPgPoolConfig(LOCAL, { DATABASE_POOL_MAX: "500" })).toThrow(
      DatabaseConfigurationError
    );
  });

  it("rejects a non-positive connection timeout", () => {
    expect(() =>
      createPgPoolConfig(LOCAL, { DATABASE_CONNECTION_TIMEOUT_MS: "0" })
    ).toThrow(DatabaseConfigurationError);
  });
});

describe("createPgPoolConfig secret hygiene", () => {
  it("keeps the password out of any message it can produce", () => {
    let message = "";
    try {
      // A pool-size mistake is the cheapest way to make this function throw
      // after the URL has already been parsed.
      createPgPoolConfig("postgresql://app:hunter2@localhost:5432/npi", {
        DATABASE_POOL_MAX: "-1",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("hunter2");
    expect(message).toContain("DATABASE_POOL_MAX");
  });
});

describe("resolveAuthSecret", () => {
  it("returns the configured secret", () => {
    expect(resolveAuthSecret({ AUTH_SECRET: "abc" })).toBe("abc");
  });

  it("throws a configuration error when the pepper is missing", () => {
    expect(() => resolveAuthSecret({})).toThrow(AuthConfigurationError);
  });

  it("throws on a blank pepper rather than silently hashing unpeppered", () => {
    expect(() => resolveAuthSecret({ AUTH_SECRET: "  " })).toThrow(AuthConfigurationError);
  });

  it("does not leak the secret in the error message", () => {
    let message = "";
    try {
      resolveAuthSecret({ AUTH_SECRET: "" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("AUTH_SECRET");
    expect(message).not.toMatch(/[0-9a-f]{16,}/i);
  });
});
