import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyInfrastructureError,
  INFRASTRUCTURE_CODES,
  toInfrastructureApiError,
} from "@/lib/infrastructure";
import { DatabaseConfigurationError } from "@/lib/db/config";
import { AuthConfigurationError } from "@/lib/auth/config";
import { ApiError } from "@/lib/errors";
import { fail } from "@/lib/api/http";

/**
 * A stand-in for a driver error. Real Prisma/pg errors are recognised by their
 * `code` and `name` fields, so plain objects exercise the same code paths
 * without booting a database.
 */
function driverError(fields: { code?: string; name?: string; message?: string }, cause?: unknown) {
  return Object.assign(new Error(fields.message ?? fields.code ?? "driver failure"), fields, {
    cause,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyInfrastructureError — configuration", () => {
  it("treats a missing DATABASE_URL as a not-configured fault", () => {
    const result = classifyInfrastructureError(new DatabaseConfigurationError("no url"));
    expect(result).toMatchObject({
      code: INFRASTRUCTURE_CODES.DATABASE_NOT_CONFIGURED,
      reason: "DATABASE_CONFIGURATION_ERROR",
    });
  });

  it("recognises the configuration code across a duplicated module instance", () => {
    const result = classifyInfrastructureError(
      Object.assign(new Error("boom"), { code: "DATABASE_CONFIGURATION_ERROR" })
    );
    expect(result?.code).toBe(INFRASTRUCTURE_CODES.DATABASE_NOT_CONFIGURED);
  });

  it("treats a missing AUTH_SECRET as a not-configured fault", () => {
    const result = classifyInfrastructureError(new AuthConfigurationError("no secret"));
    expect(result?.code).toBe(INFRASTRUCTURE_CODES.AUTH_NOT_CONFIGURED);
  });
});

describe("classifyInfrastructureError — reachability", () => {
  it.each([
    ["P1001", "can't reach the database server"],
    ["P1002", "connection timed out"],
    ["P1008", "operation timed out"],
    ["P1011", "TLS handshake failed"],
    ["P1017", "server closed the connection"],
    ["P2024", "pool acquisition timed out"],
  ])("maps Prisma %s to DATABASE_UNAVAILABLE", (code) => {
    expect(classifyInfrastructureError(driverError({ code }))?.code).toBe(
      INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE
    );
  });

  it.each(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"])(
    "maps socket error %s to DATABASE_UNAVAILABLE",
    (code) => {
      expect(classifyInfrastructureError(driverError({ code }))?.code).toBe(
        INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE
      );
    }
  );

  it.each(["57P03", "53300", "08006"])(
    "maps SQLSTATE %s to DATABASE_UNAVAILABLE",
    (code) => {
      expect(classifyInfrastructureError(driverError({ code }))?.code).toBe(
        INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE
      );
    }
  );

  it("maps a Prisma initialization failure to DATABASE_UNAVAILABLE", () => {
    const result = classifyInfrastructureError(
      driverError({ name: "PrismaClientInitializationError" })
    );
    expect(result?.code).toBe(INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE);
  });
});

describe("classifyInfrastructureError — credentials and schema", () => {
  it.each(["P1000", "28P01", "28000"])(
    "maps %s to DATABASE_AUTHENTICATION_FAILED",
    (code) => {
      expect(classifyInfrastructureError(driverError({ code }))?.code).toBe(
        INFRASTRUCTURE_CODES.DATABASE_AUTHENTICATION_FAILED
      );
    }
  );

  it.each(["P2021", "P2022", "42P01", "42703", "3D000"])(
    "maps %s to DATABASE_SCHEMA_NOT_READY",
    (code) => {
      expect(classifyInfrastructureError(driverError({ code }))?.code).toBe(
        INFRASTRUCTURE_CODES.DATABASE_SCHEMA_NOT_READY
      );
    }
  );
});

describe("classifyInfrastructureError — wrapped and unrelated errors", () => {
  it("unwraps a driver error nested in a cause chain", () => {
    const wrapped = driverError({ name: "PrismaClientUnknownRequestError" }, driverError({ code: "ECONNREFUSED" }));
    expect(classifyInfrastructureError(wrapped)?.code).toBe(
      INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE
    );
  });

  it("stops walking a self-referencing cause chain", () => {
    const loop: Record<string, unknown> = { message: "loop" };
    loop.cause = loop;
    expect(classifyInfrastructureError(loop)).toBeNull();
  });

  it("ignores a deliberate ApiError so 4xx handling is unchanged", () => {
    expect(classifyInfrastructureError(ApiError.unauthorized())).toBeNull();
    expect(classifyInfrastructureError(ApiError.badRequest("X", "y"))).toBeNull();
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a TypeError", new TypeError("undefined is not a function")],
    ["a string", "boom"],
    ["null", null],
    ["undefined", undefined],
  ])("does not classify %s", (_label, value) => {
    expect(classifyInfrastructureError(value)).toBeNull();
  });

  it("does not classify a Prisma unique-constraint violation, which is a 409", () => {
    expect(classifyInfrastructureError(driverError({ code: "P2002" }))).toBeNull();
  });
});

describe("toInfrastructureApiError", () => {
  it("produces a 503 with the stable code", () => {
    const error = toInfrastructureApiError(driverError({ code: "P1001" }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error?.status).toBe(503);
    expect(error?.code).toBe(INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE);
  });

  it("returns null for an ordinary application error", () => {
    expect(toInfrastructureApiError(new Error("bug"))).toBeNull();
  });
});

describe("fail() response shaping", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  // Next.js types `process.env.NODE_ENV` as readonly; the test needs to flip it.
  const env = process.env as unknown as Record<string, string | undefined>;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
  });

  it("returns a 503 with a stable code and no driver text for an infrastructure fault", async () => {
    env.NODE_ENV = "production";
    const response = fail(
      driverError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 10.0.0.5:5432" })
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe(INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE);
    expect(body.error.message).toBe(
      "The service database is unavailable. Please retry in a moment."
    );
  });

  it("never leaks the connection string, host, or stack in a production response", async () => {
    env.NODE_ENV = "production";
    const response = fail(
      driverError({
        code: "P1001",
        message: "Can't reach database server at postgresql://app:hunter2@10.0.0.5:5432/npi",
      })
    );

    const raw = JSON.stringify(await response.json());
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("10.0.0.5");
    expect(raw).not.toContain("postgres://");
  });

  it("does not log the driver message for an infrastructure fault", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    fail(driverError({ code: "P1001", message: "postgresql://app:hunter2@10.0.0.5:5432/npi" }));

    const logged = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain("hunter2");
    expect(logged).toContain('"reason":"P1001"');
  });

  it("still returns 500 INTERNAL_ERROR for a genuine application bug", async () => {
    env.NODE_ENV = "production";
    const response = fail(new Error("a genuine bug"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toEqual({ code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
  });

  it("passes through ApiError status and details unchanged", async () => {
    const response = fail(ApiError.conflict("DUPLICATE", "Already exists.", { field: "sku" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "DUPLICATE", message: "Already exists.", details: { field: "sku" } },
    });
  });
});
