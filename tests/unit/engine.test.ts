import { describe, expect, it, vi } from "vitest";
import { ReadinessEngine, S1_RULE_CODE } from "@/modules/readiness/engine";
import type {
  ReadinessContext,
  ReadinessContextLoader,
  ReadinessRule,
  ReadinessRuleResult,
} from "@/modules/readiness/types";
import { READINESS_CATEGORIES } from "@/modules/readiness/types";
import { baseContext } from "../helpers/readiness";

function stubLoader(ctx: ReadinessContext): ReadinessContextLoader {
  return { load: vi.fn(async () => ctx) };
}

function passRule(category: string): ReadinessRule {
  return {
    code: category.toUpperCase().replace(/ /g, "_"),
    category,
    evaluate: async (): Promise<ReadinessRuleResult[]> => [
      { ruleCode: "TEST_OK", category, status: "PASS", severity: "INFO", title: "ok", message: "ok", isBlocking: false },
    ],
  };
}

function singleResult(result: Omit<ReadinessRuleResult, "category" | "title" | "message"> & { category?: string }): ReadinessRule {
  const category = result.category ?? "BOM";
  return {
    code: category.toUpperCase().replace(/ /g, "_"),
    category,
    evaluate: async (): Promise<ReadinessRuleResult[]> => [
      {
        ...result,
        ruleCode: "TEST_RESULT",
        category,
        title: "result",
        message: "result",
      },
    ],
  };
}

describe("ReadinessEngine (deterministic, fail-safe)", () => {
  it("returns BLOCKED with S1 verification failure when the loader throws (Safety Rule 1)", async () => {
    const loader: ReadinessContextLoader = {
      load: vi.fn(async () => {
        throw new Error("database connection refused");
      }),
    };
    const engine = new ReadinessEngine(loader);
    const outcome = await engine.run(baseContext().input);

    expect(outcome.status).toBe("BLOCKED");
    expect(outcome.summary.blocking).toBeGreaterThan(0);
    expect(outcome.checks).toHaveLength(1);
    expect(outcome.checks[0]).toMatchObject({
      ruleCode: S1_RULE_CODE,
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
      category: "Safety",
    });
    expect(outcome.checks[0].message).toContain(
      "Unable to verify critical production configuration"
    );
  });

  it("converts a crashing rule into a blocking S1 verification failure", async () => {
    const exploding: ReadinessRule = {
      code: "EXPLODE",
      category: "Stations",
      evaluate: async () => {
        throw new Error("rule bug");
      },
    };
    const engine = new ReadinessEngine(stubLoader(baseContext()), [exploding]);
    const outcome = await engine.run(baseContext().input);
    expect(outcome.status).toBe("BLOCKED");
    expect(outcome.checks.some((c) => c.ruleCode === S1_RULE_CODE)).toBe(true);
  });

  it("is READY at 100% when all categories pass", async () => {
    const rules = READINESS_CATEGORIES.map(passRule);
    const engine = new ReadinessEngine(stubLoader(baseContext()), rules);
    const outcome = await engine.run(baseContext().input);

    expect(outcome.status).toBe("READY");
    expect(outcome.score).toBe(100);
    expect(outcome.summary).toMatchObject({ total: 7, passed: 7, failed: 0, warnings: 0, blocking: 0 });
    expect(outcome.rootBlockers).toHaveLength(0);
  });

  it("never lets a high score override a CRITICAL blocking failure", async () => {
    const passRules = READINESS_CATEGORIES.filter((c) => c !== "Stations").map(passRule);
    const critical = singleResult({
      category: "Stations",
      ruleCode: "STATION_CRITICAL",
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
    const engine = new ReadinessEngine(stubLoader(baseContext()), [...passRules, critical]);
    const outcome = await engine.run(baseContext().input);

    // 6/7 categories pass → high numerical score…
    expect(outcome.score).toBe(86);
    // …but the overall decision is still BLOCKED.
    expect(outcome.status).toBe("BLOCKED");
  });

  it("is NOT_READY when a HIGH (non-critical) blocking failure exists", async () => {
    const passRules = READINESS_CATEGORIES.filter((c) => c !== "BOM").map(passRule);
    const high = singleResult({
      category: "BOM",
      ruleCode: "BOM_MISSING",
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
    const engine = new ReadinessEngine(stubLoader(baseContext()), [...passRules, high]);
    const outcome = await engine.run(baseContext().input);
    expect(outcome.status).toBe("NOT_READY");
    expect(outcome.score).toBe(86);
  });

  it("is READY when only warnings exist", async () => {
    const warn = singleResult({
      category: "BOM",
      ruleCode: "BOM_WARN",
      status: "WARNING",
      severity: "MEDIUM",
      isBlocking: false,
    });
    const engine = new ReadinessEngine(stubLoader(baseContext()), [warn]);
    const outcome = await engine.run(baseContext().input);
    expect(outcome.status).toBe("READY");
    expect(outcome.summary.warnings).toBeGreaterThan(0);
  });

  it("passes the injected clock to the loader for deterministic as-of time", async () => {
    const fixed = new Date("2026-01-01T00:00:00.000Z");
    const loader: ReadinessContextLoader = {
      load: vi.fn(async (_input, asOf) => ({ ...baseContext(), asOf })),
    };
    const engine = new ReadinessEngine(loader, READINESS_CATEGORIES.map(passRule), () => fixed);
    await engine.run(baseContext().input);
    expect(loader.load).toHaveBeenCalledWith(baseContext().input, fixed);
  });
});