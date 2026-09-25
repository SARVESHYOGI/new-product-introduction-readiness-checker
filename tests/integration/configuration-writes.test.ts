/**
 * Integration tests for ADMIN configuration writes against a real PostgreSQL
 * database (TEST_DATABASE_URL / npi_test), same wipe+seed fixtures as the
 * readiness API test suite.
 *
 * Covers the guarantees the config editor is built on:
 *  - version lifecycle transitions (DRAFT/ACTIVE/OBSOLETE) for BOMs, routings
 *    and work instructions, including the forbiddden backwards moves;
 *  - immutability of published configuration (frozen effective windows,
 *    frozen routing version labels, obsolete children not editable);
 *  - server-side RBAC (config writes are ADMIN-only; ENGINEER/VIEWER/anonymous
 *    are rejected at the guard, before the body is even parsed);
 *  - strict write schemas (unknown keys are 400 VALIDATION_ERROR).
 *
 * The auth layer is mocked at the session boundary, exactly like the app's own
 * server-side authorization path (requireUser → getSessionUser).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PATCH as patchBom } from "@/app/api/boms/[id]/route";
import { POST as postBom } from "@/app/api/products/[id]/boms/route";
import { POST as postBomItem } from "@/app/api/boms/[id]/items/route";
import { PATCH as patchBomItem } from "@/app/api/boms/[id]/items/[itemId]/route";
import { DELETE as deleteBomItem } from "@/app/api/boms/[id]/items/[itemId]/route";
import { PATCH as patchRouting } from "@/app/api/routings/[id]/route";
import { POST as postRouting } from "@/app/api/products/[id]/routings/route";
import { POST as postRoutingOperation } from "@/app/api/routings/[id]/operations/route";
import { POST as postWorkInstruction } from "@/app/api/routing-operations/[operationId]/work-instructions/route";
import { PATCH as patchWorkInstruction } from "@/app/api/work-instructions/[id]/route";
import { POST as runCheck } from "@/app/api/readiness/check/route";
import { seedCore, wipe } from "../../prisma/seed";
import type { User } from "@/generated/prisma/client";
import { getSessionUser } from "@/lib/auth/session";

const admin: User = {
  id: "user_admin",
  email: "admin@npi.local",
  name: "Ava Admin",
  role: "ADMIN",
  isActive: true,
  passwordHash: "x",
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

function as(role: "ADMIN" | "ENGINEER" | "VIEWER" | "NONE") {
  vi.mocked(getSessionUser).mockResolvedValue(
    role === "NONE"
      ? (null as never)
      : role === "ADMIN"
        ? { ...admin, role: "ADMIN" }
        : { ...admin, role }
  );
}

function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: { id } };
}

/** Context for routes whose dynamic segment has another name (e.g. operationId). */
function params(record: Record<string, string>) {
  return { params: record };
}

/** Status + machine-readable error code from any response. */
async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: { code: string } };
  expect(body.error.code).toBe(code);
}

beforeAll(async () => {
  as("ADMIN");
  await wipe();
  await seedCore();
}, 120_000);

describe("BOM version lifecycle", () => {
  it("DRAFT → ACTIVE → OBSOLETE is legal; OBSOLETE can never be reopened", async () => {
    const created = await postBom(req("POST", "/api/products/prod_006/boms", { version: "T-01" }), ctx("prod_006"));
    expect(created.status).toBe(201);
    const { bom } = ((await created.json()) as { data: { bom: { id: string; status: string; version: string } } }).data;
    expect(bom.status).toBe("DRAFT");
    const id = bom.id;

    const activated = await patchBom(req("PATCH", `/api/boms/${id}`, { status: "ACTIVE" }), ctx(id));
    expect(activated.status).toBe(200);
    expect(((await activated.json()) as { data: { bom: { status: string } } }).data.bom.status).toBe("ACTIVE");

    const superseded = await patchBom(req("PATCH", `/api/boms/${id}`, { status: "OBSOLETE" }), ctx(id));
    expect(superseded.status).toBe(200);

    // OBSOLETE is permanent history (Safety S6 / immutable results): reopening
    // to ACTIVE or collapsing to DRAFT is rejected.
    await expectError(
      await patchBom(req("PATCH", `/api/boms/${id}`, { status: "ACTIVE" }), ctx(id)),
      409,
      "INVALID_STATUS_TRANSITION"
    );
    await expectError(
      await patchBom(req("PATCH", `/api/boms/${id}`, { status: "DRAFT" }), ctx(id)),
      409,
      "INVALID_STATUS_TRANSITION"
    );
  });

  it("rejects an ACTIVE BOM being un-published back to DRAFT", async () => {
    const created = await postBom(req("POST", "/api/products/prod_006/boms", { version: "T-02" }), ctx("prod_006"));
    const { bom } = ((await created.json()) as { data: { bom: { id: string } } }).data;
    await patchBom(req("PATCH", `/api/boms/${bom.id}`, { status: "ACTIVE" }), ctx(bom.id));

    await expectError(
      await patchBom(req("PATCH", `/api/boms/${bom.id}`, { status: "DRAFT" }), ctx(bom.id)),
      409,
      "INVALID_STATUS_TRANSITION"
    );
  });

  it("freezes the effective window once a BOM version is published (no-op re-save allowed)", async () => {
    const created = await postBom(
      req("POST", "/api/products/prod_006/boms", {
        version: "T-03",
        effectiveFrom: "2025-01-01",
      }),
      ctx("prod_006")
    );
    const { bom } = ((await created.json()) as { data: { bom: { id: string } } }).data;
    await patchBom(req("PATCH", `/api/boms/${bom.id}`, { status: "ACTIVE" }), ctx(bom.id));

    await expectError(
      await patchBom(req("PATCH", `/api/boms/${bom.id}`, { effectiveFrom: "2025-02-01" }), ctx(bom.id)),
      409,
      "PUBLISHED_BOM_IMMUTABLE"
    );

    // Saving the same instant is a no-op and stays permitted.
    const noop = await patchBom(req("PATCH", `/api/boms/${bom.id}`, { effectiveFrom: "2025-01-01" }), ctx(bom.id));
    expect(noop.status).toBe(200);
  });

  it("makes an obsoleted BOM's components read-only", async () => {
    const created = await postBom(req("POST", "/api/products/prod_006/boms", { version: "T-04" }), ctx("prod_006"));
    const { bom } = ((await created.json()) as { data: { bom: { id: string } } }).data;
    const item = await postBomItem(
      req("POST", `/api/boms/${bom.id}/items`, {
        componentSku: "T-04-CMP",
        componentName: "Test Component",
        quantity: 1,
        unit: "pcs",
        isRequired: true,
      }),
      ctx(bom.id)
    );
    expect(item.status).toBe(201);
    const { item: createdItem } = ((await item.json()) as { data: { item: { id: string } } }).data;

    await patchBom(req("PATCH", `/api/boms/${bom.id}`, { status: "OBSOLETE" }), ctx(bom.id));

    // No new components may be added to permanent history…
    await expectError(
      await postBomItem(
        req("POST", `/api/boms/${bom.id}/items`, {
          componentSku: "T-04-CMP-2",
          componentName: "Another Component",
          quantity: 2,
          unit: "pcs",
          isRequired: true,
        }),
        ctx(bom.id)
      ),
      409,
      "OBSOLETE_BOM_IMMUTABLE"
    );

    // …and existing ones may not be edited or removed with it.
    await expectError(
      await patchBomItem(
        req("PATCH", `/api/boms/${bom.id}/items/${createdItem.id}`, { quantity: 3 }),
        params({ id: bom.id, itemId: createdItem.id })
      ),
      409,
      "OBSOLETE_BOM_IMMUTABLE"
    );
    await expectError(
      await deleteBomItem(
        req("DELETE", `/api/boms/${bom.id}/items/${createdItem.id}`),
        params({ id: bom.id, itemId: createdItem.id })
      ),
      409,
      "OBSOLETE_BOM_IMMUTABLE"
    );
  });
});

describe("routing lifecycle", () => {
  it("applies the shared transition policy and freezes the version label when published", async () => {
    const created = await postRouting(
      req("POST", "/api/products/prod_006/routings", { code: "TST-ROUTE", version: "1" }),
      ctx("prod_006")
    );
    expect(created.status).toBe(201);
    const { routing } = ((await created.json()) as { data: { routing: { id: string } } }).data;
    const id = routing.id;

    const activated = await patchRouting(req("PATCH", `/api/routings/${id}`, { status: "ACTIVE" }), ctx(id));
    expect(activated.status).toBe(200);

    // ACTIVE → DRAFT is a forbidden backwards move.
    await expectError(
      await patchRouting(req("PATCH", `/api/routings/${id}`, { status: "DRAFT" }), ctx(id)),
      409,
      "INVALID_STATUS_TRANSITION"
    );

    // The version label is identity once published; renaming it is rejected,
    // while re-saving the same label is a permitted no-op.
    await expectError(
      await patchRouting(req("PATCH", `/api/routings/${id}`, { version: "2" }), ctx(id)),
      409,
      "PUBLISHED_ROUTING_IMMUTABLE"
    );
    const noop = await patchRouting(req("PATCH", `/api/routings/${id}`, { version: "1" }), ctx(id));
    expect(noop.status).toBe(200);

    const superseded = await patchRouting(req("PATCH", `/api/routings/${id}`, { status: "OBSOLETE" }), ctx(id));
    expect(superseded.status).toBe(200);

    await expectError(
      await patchRouting(req("PATCH", `/api/routings/${id}`, { status: "ACTIVE" }), ctx(id)),
      409,
      "INVALID_STATUS_TRANSITION"
    );
  });

  it("makes an obsoleted routing's operations read-only", async () => {
    const created = await postRouting(
      req("POST", "/api/products/prod_006/routings", { code: "TST-ROUTE-2", version: "1" }),
      ctx("prod_006")
    );
    const { routing } = ((await created.json()) as { data: { routing: { id: string } } }).data;

    const op = await postRoutingOperation(
      req("POST", `/api/routings/${routing.id}/operations`, {
        sequence: 10,
        operationCode: "OP-TST-2",
        operationName: "Test Operation",
        standardCycleTimeSeconds: 30,
        required: true,
        stationId: "st_301",
      }),
      ctx(routing.id)
    );
    expect(op.status).toBe(201);

    await patchRouting(req("PATCH", `/api/routings/${routing.id}`, { status: "OBSOLETE" }), ctx(routing.id));

    await expectError(
      await postRoutingOperation(
        req("POST", `/api/routings/${routing.id}/operations`, {
          sequence: 20,
          operationCode: "OP-TST-2B",
          operationName: "Another Operation",
          standardCycleTimeSeconds: 10,
          required: true,
          stationId: "st_301",
        }),
        ctx(routing.id)
      ),
      409,
      "OBSOLETE_ROUTING_IMMUTABLE"
    );
  });
});

describe("work instruction lifecycle", () => {
  it("rejects un-publishing an ACTIVE instruction and editing published content", async () => {
    // op_0204 (prod_002) is intentionally seeded without a work instruction.
    const created = await postWorkInstruction(
      req("POST", "/api/routing-operations/op_0204/work-instructions", {
        title: "Burn-in Work Instruction",
        content: "1. Load units.\n2. Run the burn-in profile.\n3. Record readings.",
        status: "ACTIVE",
      }),
      params({ operationId: "op_0204" })
    );
    expect(created.status).toBe(201);
    const resulting = ((await created.json()) as { data: { instruction: { id: string; status: string } } }).data;
    expect(resulting.instruction.status).toBe("ACTIVE");
    const wiId = resulting.instruction.id;

    // ACTIVE → DRAFT would silently un-publish a document operators may have
    // been trained against — rejected.
    await expectError(
      await patchWorkInstruction(req("PATCH", `/api/work-instructions/${wiId}`, { status: "DRAFT" }), ctx(wiId)),
      409,
      "INVALID_INSTRUCTION_STATUS_TRANSITION"
    );

    // Published content is frozen; changes go through a new version.
    await expectError(
      await patchWorkInstruction(
        req("PATCH", `/api/work-instructions/${wiId}`, { content: "1. Changed." }),
        ctx(wiId)
      ),
      409,
      "ACTIVE_INSTRUCTION_IMMUTABLE"
    );

    // Legal move: supersede to OBSOLETE (permanent history).
    const superseded = await patchWorkInstruction(
      req("PATCH", `/api/work-instructions/${wiId}`, { status: "OBSOLETE" }),
      ctx(wiId)
    );
    expect(superseded.status).toBe(200);
  });
});

describe("server-side RBAC on configuration writes", () => {
  it("rejects ENGINEER, VIEWER and anonymous users before parsing the request", async () => {
    // ENGINEER may run checks but never write configuration.
    as("ENGINEER");
    await expectError(
      await patchBom(req("PATCH", "/api/boms/bom_101", {}), ctx("bom_101")),
      403,
      "FORBIDDEN"
    );

    // VIEWER is read-only.
    as("VIEWER");
    await expectError(
      await postBom(req("POST", "/api/products/prod_001/boms", { version: "X" }), ctx("prod_001")),
      403,
      "FORBIDDEN"
    );

    // Anonymous requests get 401 (no session at all).
    as("NONE");
    await expectError(
      await postBom(req("POST", "/api/products/prod_001/boms", { version: "X" }), ctx("prod_001")),
      401,
      "UNAUTHORIZED"
    );
  });

  it("an ADMIN can write configuration and ENGINEER can run checks", async () => {
    as("ADMIN");
    const write = await patchBom(req("PATCH", "/api/boms/bom_101", { status: "ACTIVE" }), ctx("bom_101"));
    expect(write.status).toBe(200);

    as("ENGINEER");
    const check = await runCheck(
      req("POST", "/api/readiness/check", {
        productId: "prod_001",
        bomVersionId: "bom_101",
        routingId: "route_101",
        lineId: "line_01",
      }),
      {}
    );
    expect(check.status).toBe(201);
  });
});

describe("strict write schemas", () => {
  it("rejects unknown keys on config writes and on the readiness check input", async () => {
    as("ADMIN");
    await expectError(
      await patchBom(req("PATCH", "/api/boms/bom_101", { status: "ACTIVE", unknownKey: 1 }), ctx("bom_101")),
      400,
      "VALIDATION_ERROR"
    );

    as("ENGINEER");
    await expectError(
      await runCheck(
        req("POST", "/api/readiness/check", {
          productId: "prod_001",
          bomVersionId: "bom_101",
          routingId: "route_101",
          lineId: "line_01",
          extra: "nope",
        }),
        {}
      ),
      400,
      "VALIDATION_ERROR"
    );
  });
});