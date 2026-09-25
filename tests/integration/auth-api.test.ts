/**
 * Integration tests for POST /api/auth/login against a real PostgreSQL
 * database (TEST_DATABASE_URL / npi_test).
 *
 * These are the regression tests for the production 500: the failure was a
 * database/infrastructure fault surfacing as an opaque INTERNAL_ERROR. Only the
 * session-cookie write is mocked (it needs a Next.js request scope); the user
 * lookup, the scrypt verification, and the whole error path are real.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/db/prisma";
import { seedCore, wipe } from "../../prisma/seed";

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(async () => undefined),
  destroySession: vi.fn(async () => undefined),
  getSessionUser: vi.fn(async () => null),
}));

import { createSession } from "@/lib/auth/session";
import { INFRASTRUCTURE_CODES } from "@/lib/infrastructure";

interface ErrorPayload {
  error: { code: string; message: string; details?: unknown };
}

let requestCounter = 0;

function post(body: unknown): Promise<Response> {
  // The route rate-limits by client IP (10/min). Give every test request its
  // own synthetic IP so the suite exercises the auth path rather than tripping
  // the limiter; one test asserts the 429 separately.
  requestCounter += 1;
  return login(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.0.0.${requestCounter}`,
      },
      body: JSON.stringify(body),
    }),
    {}
  );
}

const VALID = { email: "engineer@npi.local", password: "engineer123" };

beforeAll(async () => {
  await wipe();
  await seedCore();
}, 120_000);

beforeEach(() => {
  vi.mocked(createSession).mockClear();
});

describe("POST /api/auth/login (integration)", () => {
  it("authenticates a seeded user and creates a session", async () => {
    const res = await post(VALID);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { user: { email: string; role: string; name: string } };
    };
    expect(body.data.user).toMatchObject({
      email: "engineer@npi.local",
      role: "ENGINEER",
    });
    expect(createSession).toHaveBeenCalledOnce();
  });

  it("returns the ADMIN role for an admin, proving the role is read from the database", async () => {
    const res = await post({ email: "admin@npi.local", password: "admin123" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { user: { role: string } } };
    expect(body.data.user.role).toBe("ADMIN");
  });

  it("never returns the password hash", async () => {
    const res = await post(VALID);
    expect(await res.text()).not.toContain("scrypt$");
  });

  it("rejects a wrong password with 401, not 500", async () => {
    const res = await post({ ...VALID, password: "wrong-password" });

    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorPayload;
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects an unknown user with the same 401, so accounts cannot be enumerated", async () => {
    const unknown = await post({ email: "nobody@npi.local", password: VALID.password });
    const wrongPassword = await post({ ...VALID, password: "wrong-password" });

    expect(unknown.status).toBe(401);
    expect((await unknown.json()) as ErrorPayload).toEqual(
      (await wrongPassword.json()) as ErrorPayload
    );
  });

  it("rejects a deactivated user", async () => {
    await prisma.user.update({
      where: { email: "viewer@npi.local" },
      data: { isActive: false },
    });

    const res = await post({ email: "viewer@npi.local", password: "viewer123" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorPayload).error.code).toBe("INVALID_CREDENTIALS");

    await prisma.user.update({ where: { email: "viewer@npi.local" }, data: { isActive: true } });
  });

  it("returns 400 for a malformed email and 401 for a well-formed unknown one", async () => {
    const malformed = await post({ email: "not-an-email", password: VALID.password });
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as ErrorPayload).error.code).toBe("VALIDATION_ERROR");

    const unknown = await post({ email: "nobody@npi.local", password: VALID.password });
    expect(unknown.status).toBe(401);
  });

  it("rejects unexpected fields instead of ignoring them", async () => {
    const res = await post({ ...VALID, isAdmin: true });
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated logins from one client IP", async () => {
    const attempt = () =>
      login(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
          body: JSON.stringify({ ...VALID, password: "wrong-password" }),
        }),
        {}
      );

    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await attempt()).status);

    expect(statuses).toContain(401);
    expect(statuses[statuses.length - 1]).toBe(429);
  });
});

describe("POST /api/auth/login (infrastructure faults)", () => {
  it("returns 503 AUTH_NOT_CONFIGURED when AUTH_SECRET is absent", async () => {
    const original = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      const res = await post(VALID);
      expect(res.status).toBe(503);
      expect(((await res.json()) as ErrorPayload).error.code).toBe(
        INFRASTRUCTURE_CODES.AUTH_NOT_CONFIGURED
      );
    } finally {
      process.env.AUTH_SECRET = original;
    }
  });

  it("returns 503 DATABASE_SCHEMA_NOT_READY when the schema is missing", async () => {
    // A user lookup against a table that does not exist is what a deployment
    // that skipped `prisma migrate deploy` produces. It must never be a 500.
    const user = prisma.user;
    const spy = vi.spyOn(user, "findUnique").mockRejectedValueOnce(
      Object.assign(new Error("The table `public.User` does not exist in the database."), {
        code: "P2021",
        name: "PrismaClientKnownRequestError",
      })
    );

    const res = await post(VALID);
    expect(res.status).toBe(503);
    expect(((await res.json()) as ErrorPayload).error.code).toBe(
      INFRASTRUCTURE_CODES.DATABASE_SCHEMA_NOT_READY
    );
    expect(createSession).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns 503 DATABASE_UNAVAILABLE when the database cannot be reached", async () => {
    const spy = vi
      .spyOn(prisma.user, "findUnique")
      .mockRejectedValueOnce(
        Object.assign(
          new Error("Can't reach database server at postgresql://app:hunter2@db.internal:5432/npi"),
          { code: "P1001" }
        )
      );

    const res = await post(VALID);
    const raw = await res.text();

    expect(res.status).toBe(503);
    expect((JSON.parse(raw) as ErrorPayload).error.code).toBe(
      INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE
    );
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("db.internal");
    spy.mockRestore();
  });

  it("returns 503 DATABASE_AUTHENTICATION_FAILED when the server rejects the credentials", async () => {
    const spy = vi
      .spyOn(prisma.user, "findUnique")
      .mockRejectedValueOnce(
        Object.assign(new Error("Authentication failed against database server"), { code: "P1000" })
      );

    const res = await post(VALID);
    expect(res.status).toBe(503);
    expect(((await res.json()) as ErrorPayload).error.code).toBe(
      INFRASTRUCTURE_CODES.DATABASE_AUTHENTICATION_FAILED
    );
    spy.mockRestore();
  });

  it("still returns 500 INTERNAL_ERROR for a genuine application bug", async () => {
    const spy = vi
      .spyOn(prisma.user, "findUnique")
      .mockRejectedValueOnce(new TypeError("undefined is not a function"));

    const res = await post(VALID);
    expect(res.status).toBe(500);
    expect(((await res.json()) as ErrorPayload).error.code).toBe("INTERNAL_ERROR");
    spy.mockRestore();
  });
});
