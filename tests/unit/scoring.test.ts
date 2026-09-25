import { describe, expect, it } from "vitest";
import {
  buildOutcome,
  computeCategoryStatuses,
  overallStatus,
  summarize,
} from "@/modules/readiness/scoring";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import { READINESS_CATEGORIES } from "@/modules/readiness/types";

function result(overrides: Partial<ReadinessRuleResult>): ReadinessRuleResult {
  return {
    ruleCode: "R",
    category: "BOM",
    status: "PASS",
    severity: "INFO",
    title: "r",
    message: "r",
    isBlocking: false,
    ...overrides,
  };
}

function allCategoriesPass(): ReadinessRuleResult[] {
  return READINESS_CATEGORIES.map((category) =>
    result({ ruleCode: "OK", category, message: "ok" })
  );
}

describe("Readiness scoring", () => {
  it("scores 100 and READY when all 7 categories pass", () => {
    const outcome = buildOutcome(allCategoriesPass(), []);
    expect(outcome.status).toBe("READY");
    expect(outcome.score).toBe(100);
    expect(outcome.summary).toEqual({ total: 7, passed: 7, warnings: 0, failed: 0, blocking: 0 });
  });

  it("scores 71 for 5 PASS, 1 WARNING, 1 FAIL", () => {
    const checks: ReadinessRuleResult[] = [
      ...READINESS_CATEGORIES.slice(0, 5).map((category) =>
        result({ category, status: "PASS", message: "ok" })
      ),
      result({ category: "Operators", status: "WARNING", severity: "MEDIUM", message: "warn" }),
      result({ category: "Stations", status: "FAIL", severity: "HIGH", isBlocking: true, message: "fail" }),
    ];
    const outcome = buildOutcome(checks, []);
    expect(outcome.score).toBe(71);
    expect(outcome.status).toBe("NOT_READY");
    expect(outcome.summary).toMatchObject({ passed: 5, warnings: 1, failed: 1, blocking: 1 });
  });

  it("stays BLOCKED when a CRITICAL fail exists even with 6 passing categories", () => {
    const checks = [
      ...READINESS_CATEGORIES.filter((c) => c !== "Stations").map((category) =>
        result({ category, message: "ok" })
      ),
      result({
        category: "Stations",
        status: "FAIL",
        severity: "CRITICAL",
        isBlocking: true,
        message: "inactive station",
      }),
    ];
    const outcome = buildOutcome(checks, []);
    expect(outcome.score).toBe(86);
    expect(outcome.status).toBe("BLOCKED");
  });

  it("overallStatus is READY for WARNING-only results", () => {
    const status = overallStatus([
      result({ status: "WARNING", severity: "MEDIUM", message: "w" }),
    ]);
    expect(status).toBe("READY");
  });

  it("ignores a non-blocking FAIL when deriving the overall status", () => {
    // The contract is defined in terms of *blocking* failures. A non-blocking
    // FAIL is an engineer-facing data-quality signal, not a production hold.
    const status = overallStatus([
      result({ status: "FAIL", severity: "LOW", isBlocking: false, message: "f" }),
    ]);
    expect(status).toBe("READY");
  });

  it("ignores a non-blocking CRITICAL-severity FAIL for the overall status", () => {
    // Severity alone does not gate production: only blocking failures do.
    const status = overallStatus([
      result({ status: "FAIL", severity: "CRITICAL", isBlocking: false, message: "f" }),
    ]);
    expect(status).toBe("READY");
  });

  it("still holds production for a blocking FAIL regardless of severity", () => {
    expect(
      overallStatus([result({ status: "FAIL", severity: "LOW", isBlocking: true, message: "f" })])
    ).toBe("NOT_READY");
    expect(
      overallStatus([
        result({ status: "FAIL", severity: "CRITICAL", isBlocking: true, message: "f" }),
      ])
    ).toBe("BLOCKED");
  });

  it("a non-blocking FAIL still lowers the category score", () => {
    const outcome = buildOutcome(
      [
        ...READINESS_CATEGORIES.filter((c) => c !== "BOM").map((category) =>
          result({ category, message: "ok" })
        ),
        result({ category: "BOM", status: "FAIL", severity: "LOW", isBlocking: false, message: "f" }),
      ],
      []
    );
    expect(outcome.score).toBe(86);
    expect(outcome.status).toBe("READY");
  });

  it("computeCategoryStatuses marks unseen categories UNVERIFIED", () => {
    const statuses = computeCategoryStatuses([
      result({ category: "BOM", message: "ok" }),
    ]);
    expect(statuses.BOM).toBe("PASS");
    expect(statuses["Work Instructions"]).toBe("UNVERIFIED");
    expect(statuses.Stations).toBe("UNVERIFIED");
  });

  it("computeCategoryStatuses prioritizes FAIL then WARNING over PASS", () => {
    const statuses = computeCategoryStatuses([
      result({ category: "BOM", message: "pass" }),
      result({ category: "BOM", status: "WARNING", severity: "MEDIUM", message: "w" }),
    ]);
    expect(statuses.BOM).toBe("WARNING");

    const failed = computeCategoryStatuses([
      result({ category: "BOM", message: "pass" }),
      result({ category: "BOM", status: "WARNING", severity: "LOW", message: "w" }),
      result({ category: "BOM", status: "FAIL", severity: "HIGH", isBlocking: true, message: "f" }),
    ]);
    expect(failed.BOM).toBe("FAIL");
  });

  it("summarize counts blocking failures across all results", () => {
    const summary = summarize(
      computeCategoryStatuses([result({ category: "BOM", status: "FAIL", severity: "CRITICAL", isBlocking: true, message: "f" })]),
      [
        result({ category: "BOM", status: "FAIL", severity: "CRITICAL", isBlocking: true, message: "f" }),
        result({ category: "Operators", status: "FAIL", severity: "HIGH", isBlocking: true, message: "f" }),
      ]
    );
    expect(summary.blocking).toBe(2);
  });
});