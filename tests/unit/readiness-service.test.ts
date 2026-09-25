import { describe, expect, it, vi } from "vitest";
import { ReadinessService } from "@/modules/readiness/service";
import { S1_RULE_CODE } from "@/modules/readiness/engine";
import { ApiError } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth/guard";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Safety Rule 1 also covers the service's own ownership preflight. If the
 * database cannot be reached we must never fall through to READY — the check
 * is recorded as BLOCKED with the canonical S1 verification result.
 *
 * The service is constructed with a stub client so the failure can be injected
 * deterministically without touching a real database.
 */
const actor = { id: "user_eng", role: "ENGINEER" } as AuthUser;

const validInput = {
  productId: "prod_001",
  bomVersionId: "bom_101",
  routingId: "route_101",
  lineId: "line_01",
};

function stubClient(productFindUnique: () => Promise<unknown>) {
  return {
    product: { findUnique: vi.fn(productFindUnique) },
    bOMVersion: { findUnique: vi.fn(async () => ({ id: "bom_101", productId: "prod_001" })) },
    routing: { findUnique: vi.fn(async () => ({ id: "route_101", productId: "prod_001" })) },
    line: { findUnique: vi.fn(async () => ({ id: "line_01" })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        readinessCheck: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "chk_blocked",
            status: data.status,
            score: data.score,
            results: [],
          })),
        },
        auditLog: { create: vi.fn(async () => ({})) },
      })
    ),
  } as unknown as PrismaClient;
}

describe("ReadinessService ownership preflight is fail-safe", () => {
  it("records a BLOCKED S1 check when the preflight database call throws", async () => {
    const client = stubClient(async () => {
      throw new Error("database connection refused");
    });
    const service = new ReadinessService(client);

    const check = await service.runCheck(validInput, actor);

    expect(check.status).toBe("BLOCKED");
    // The engine is never reached, so no category can be scored as passing.
    expect(check.score).toBe(0);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it("still surfaces a genuine 'does not belong together' answer as a 400, not a check", async () => {
    // The BOM belongs to another product — that is a *known* answer, so the
    // request is rejected rather than recorded as a BLOCKED check.
    const client = stubClient(async () => ({ id: "prod_001" }));
    vi.mocked(client.bOMVersion.findUnique).mockResolvedValue({
      id: "bom_102",
      productId: "prod_002",
    } as never);
    const service = new ReadinessService(client);

    await expect(service.runCheck(validInput, actor)).rejects.toBeInstanceOf(ApiError);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-existent product with a 400 rather than a fail-safe check", async () => {
    const client = stubClient(async () => null);
    const service = new ReadinessService(client);

    await expect(service.runCheck(validInput, actor)).rejects.toBeInstanceOf(ApiError);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("the persisted fail-safe result carries the canonical S1 rule code", () => {
    // Guards the contract the result page and audit trail depend on.
    expect(S1_RULE_CODE).toBe("S1_VERIFICATION_FAILED");
  });
});
