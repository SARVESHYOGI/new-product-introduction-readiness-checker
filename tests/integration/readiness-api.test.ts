/**
 * Integration tests for POST /api/readiness/check against a real PostgreSQL
 * database (TEST_DATABASE_URL / npi_test).
 *
 * The test database is fully seeded with the real demo fixtures (wipe +
 * seedCore + seedReadinessHistory from prisma/seed.ts), so the engine runs the
 * exact same code path against realistic data. The auth layer is mocked at the
 * session boundary, exactly as the app's own server-side authorization does.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST as runCheck } from "@/app/api/readiness/check/route";
import { GET as getCheckRoute } from "@/app/api/readiness/[id]/route";
import { ReadinessService } from "@/modules/readiness/service";
import { seedCore, seedReadinessHistory, wipe } from "../../prisma/seed";
import type { User } from "@/generated/prisma/client";

// Session-boundary mock: keeps `next/headers`/cookie handling out of the tests
// while still going through the real `requireUser` authorization guard.
const engineer: User = {
  id: "user_eng",
  email: "engineer@npi.local",
  name: "Eli Engineer",
  role: "ENGINEER",
  isActive: true,
  passwordHash: "x",
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

import { getSessionUser } from "@/lib/auth/session";

function call(body: unknown, role: string = "ENGINEER") {
  vi.mocked(getSessionUser).mockResolvedValue(
    role === "VIEWER"
      ? { ...engineer, role: "VIEWER" }
      : role === "ADMIN"
        ? { ...engineer, role: "ADMIN" }
        : role === "NONE"
          ? (null as never)
          : engineer
  );
  const request = new Request("http://localhost/api/readiness/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return runCheck(request, {});
}

beforeAll(async () => {
  vi.mocked(getSessionUser).mockResolvedValue(engineer as never);
  await wipe();
  await seedCore();
  await seedReadinessHistory();
}, 120_000);

describe("POST /api/readiness/check (integration)", () => {
  it("returns READY 100% for prod_001 (everything valid) and persists the results", async () => {
    const res = await call({
      productId: "prod_001",
      bomVersionId: "bom_101",
      routingId: "route_101",
      lineId: "line_01",
    });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: { check: { id: string; status: string; score: number; summary: Record<string, number>; rootBlockers: unknown[] } };
    };
    const check = payload.data.check;

    expect(check.status).toBe("READY");
    expect(check.score).toBe(100);
    expect(check.summary).toMatchObject({ passed: 7, failed: 0, warnings: 0, blocking: 0 });
    expect(check.rootBlockers).toHaveLength(0);

    // Persistence: the same result is re-readable via the service (immutable).
    const persisted = await new ReadinessService().getCheck(check.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.status).toBe("READY");
    expect(persisted!.results.length).toBeGreaterThanOrEqual(7);

    // The GET route serves the persisted references too.
    const getRes = await getCheckRoute(new Request("http://localhost/api/readiness/x", { method: "GET" }), {
      params: Promise.resolve({ id: check.id }),
    });
    expect(getRes.status).toBe(200);
    const getPayload = (await getRes.json()) as {
      data: { check: { product: { id: string }; bomVersion: { version: string }; line: { code: string } } };
    };
    expect(getPayload.data.check.product.id).toBe("prod_001");
    expect(getPayload.data.check.bomVersion.version).toBe("3");
    expect(getPayload.data.check.line.code).toBe("LINE-01");
  });

  it("returns NOT_READY 71% with root blockers for prod_002 (missing WI)", async () => {
    const res = await call({
      productId: "prod_002",
      bomVersionId: "bom_102",
      routingId: "route_102",
      lineId: "line_02",
    });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: { check: { status: string; score: number; summary: { failed: number; blocking: number }; rootBlockers: unknown[] } };
    };
    const check = payload.data.check;

    expect(check.status).toBe("NOT_READY");
    expect(check.score).toBe(71);
    expect(check.summary.failed).toBeGreaterThan(0);
    expect(check.summary.blocking).toBeGreaterThan(0);
    expect(check.rootBlockers.length).toBeGreaterThan(0);
  });

  it("returns BLOCKED for prod_004 (inactive station)", async () => {
    const res = await call({
      productId: "prod_004",
      bomVersionId: "bom_104",
      routingId: "route_104",
      lineId: "line_02",
    });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: { check: { status: string; score: number; rootBlockers: Array<{ category: string; severity: string; impacts: string[] }> } };
    };
    const check = payload.data.check;
    expect(check.status).toBe("BLOCKED");
    expect(check.rootBlockers.some((b) => b.severity === "CRITICAL")).toBe(true);
  });

  it("rejects mismatched configuration with 400 (IDs that do not belong together)", async () => {
    // bom_102 belongs to prod_002, not prod_001.
    const res = await call({
      productId: "prod_001",
      bomVersionId: "bom_102",
      routingId: "route_101",
      lineId: "line_01",
    });
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("MISMATCHED_CONFIGURATION");
  });

  it("rejects missing fields with 400", async () => {
    const res = await call({ productId: "prod_001" });
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed JSON with 400", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(engineer as never);
    const request = new Request("http://localhost/api/readiness/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await runCheck(request, {});
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated and 403 for the VIEWER role", async () => {
    const body = {
      productId: "prod_001",
      bomVersionId: "bom_101",
      routingId: "route_101",
      lineId: "line_01",
    };

    const anon = await call(body, "NONE");
    expect(anon.status).toBe(401);

    const viewer = await call(body, "VIEWER");
    expect(viewer.status).toBe(403);
  });

  it("persists audit history for the check (readiness history endpoint)", async () => {
    const res = await call({
      productId: "prod_001",
      bomVersionId: "bom_101",
      routingId: "route_101",
      lineId: "line_01",
    });
    const payload = (await res.json()) as { data: { check: { id: string } } };
    const id = payload.data.check.id;

    const history = await new ReadinessService().getHistory("prod_001", 10);
    expect(history.some((h) => h.id === id)).toBe(true);
  });
});