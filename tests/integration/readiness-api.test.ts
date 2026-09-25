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
import { ProductService } from "@/modules/products/service";
import { seedCore, seedReadinessHistory, wipe, UNCONFIGURED_PRODUCT_ID } from "../../prisma/seed";
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

  it("returns NOT_READY 86% for prod_003 (missing operator assignments)", async () => {
    const res = await call({
      productId: "prod_003",
      bomVersionId: "bom_103",
      routingId: "route_103",
      lineId: "line_02",
    });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: { check: { status: string; score: number; categoryStatuses: Record<string, string> } };
    };
    const check = payload.data.check;
    expect(check.status).toBe("NOT_READY");
    expect(check.score).toBe(86);
    // Only the Operators category fails; a high score must not imply READY.
    expect(check.categoryStatuses.Operators).toBe("FAIL");
  });

  it("returns BLOCKED 71% for prod_005 (conflicting configuration)", async () => {
    const res = await call({
      productId: "prod_005",
      bomVersionId: "bom_105",
      routingId: "route_105",
      lineId: "line_03",
    });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: { check: { status: string; score: number; categoryStatuses: Record<string, string> } };
    };
    const check = payload.data.check;
    expect(check.status).toBe("BLOCKED");
    expect(check.score).toBe(71);
    // Safety S3: duplicate active BOM and overlapping identifier ranges.
    expect(check.categoryStatuses.BOM).toBe("FAIL");
    expect(check.categoryStatuses["Identifier Range"]).toBe("FAIL");
  });

  it("refuses to check an unconfigured product (no BOM / no routing) and never returns READY", async () => {
    // prod_006 has neither a BOM version nor a routing, so there is nothing to
    // validate. Borrowing prod_001's configuration must be rejected as a
    // mismatch rather than silently scored as ready.
    const borrowedConfiguration = await call({
      productId: UNCONFIGURED_PRODUCT_ID,
      bomVersionId: "bom_101",
      routingId: "route_101",
      lineId: "line_01",
    });
    expect(borrowedConfiguration.status).toBe(400);
    const borrowedBody = (await borrowedConfiguration.json()) as {
      error: { code: string };
    };
    expect(borrowedBody.error.code).toBe("MISMATCHED_CONFIGURATION");

    // A non-existent BOM is rejected up front — no check is ever created.
    const missingBom = await call({
      productId: UNCONFIGURED_PRODUCT_ID,
      bomVersionId: "bom_does_not_exist",
      routingId: "route_101",
      lineId: "line_01",
    });
    expect(missingBom.status).toBe(400);
    const missingBomBody = (await missingBom.json()) as { error: { code: string } };
    expect(missingBomBody.error.code).toBe("INVALID_BOM");

    // No readiness result of any kind was persisted for the unconfigured product.
    const service = new ReadinessService();
    const history = await service.getHistory(UNCONFIGURED_PRODUCT_ID, 10);
    expect(history).toHaveLength(0);
    expect(history.some((h) => h.status === "READY")).toBe(false);
  });

  it("reports prod_006 as NOT CONFIGURED through the product service", async () => {
    const service = new ProductService();
    const unconfigured = await service.getById(UNCONFIGURED_PRODUCT_ID);

    expect(unconfigured).not.toBeNull();
    expect(unconfigured!.configuration.isConfigured).toBe(false);
    expect(unconfigured!.configuration.missing).toEqual(["BOM", "ROUTING"]);
    expect(unconfigured!.lastCheckStatus).toBeNull();
    expect(unconfigured!.lastCheckScore).toBeNull();

    // A fully configured product reports no gaps and the same shape as the
    // catalog list (so the client can share one type).
    const configured = await service.getById("prod_001");
    expect(configured!.configuration.isConfigured).toBe(true);
    expect(configured!.configuration.missing).toEqual([]);
    expect(configured!.lastCheckStatus).toBe("READY");
    expect(configured!.lastCheckScore).toBe(100);

    const listed = await service.list();
    const listedConfigured = listed.find((p) => p.id === "prod_001");
    const listedUnconfigured = listed.find((p) => p.id === UNCONFIGURED_PRODUCT_ID);
    expect(listedConfigured?.configuration).toEqual(configured!.configuration);
    expect(listedUnconfigured?.configuration.isConfigured).toBe(false);
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