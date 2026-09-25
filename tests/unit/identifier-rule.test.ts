import { describe, expect, it } from "vitest";
import { identifierRule } from "@/modules/readiness/rules/identifier";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import { baseContext, identifierRange } from "../helpers/readiness";

function find(results: ReadinessRuleResult[], code: string) {
  return results.find((r) => r.ruleCode === code);
}

describe("Rule 4 — Identifier Range", () => {
  it("returns PASS for a valid active range", async () => {
    const results = await identifierRule.evaluate(baseContext());
    expect(find(results, "IDENTIFIER_RANGE_OK")).toMatchObject({ status: "PASS" });
  });

  it("FAILs when no identifier range is configured", async () => {
    const results = await identifierRule.evaluate(baseContext({ identifierRanges: [] }));
    expect(find(results, "IDENTIFIER_RANGE_EXISTS")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs when ranges exist but none are active", async () => {
    const results = await identifierRule.evaluate(
      baseContext({ identifierRanges: [identifierRange({ status: "INACTIVE" })] })
    );
    expect(find(results, "IDENTIFIER_RANGE_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) on invalid bounds (start >= end)", async () => {
    const results = await identifierRule.evaluate(
      baseContext({ identifierRanges: [identifierRange({ startNumber: 5000, endNumber: 1000 })] })
    );
    expect(find(results, "IDENTIFIER_RANGE_BOUNDS")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when the current number is outside the range", async () => {
    const results = await identifierRule.evaluate(
      baseContext({ identifierRanges: [identifierRange({ currentNumber: 999999 })] })
    );
    expect(find(results, "IDENTIFIER_CURRENT_IN_RANGE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("WARNs when the range is nearly exhausted (current === end)", async () => {
    const results = await identifierRule.evaluate(
      baseContext({ identifierRanges: [identifierRange({ currentNumber: 99999 })] })
    );
    expect(find(results, "IDENTIFIER_CURRENT_IN_RANGE")).toMatchObject({
      status: "WARNING",
      isBlocking: false,
    });
  });

  it("FAILs (CRITICAL) on overlapping active ranges (Safety S3)", async () => {
    const results = await identifierRule.evaluate(
      baseContext({
        identifierRanges: [
          identifierRange({ id: "ir_1", startNumber: 1000, endNumber: 99999 }),
          identifierRange({ id: "ir_2", startNumber: 5000, endNumber: 49999 }),
        ],
      })
    );
    const result = find(results, "IDENTIFIER_RANGE_OVERLAP");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
      affectedEntityType: "IdentifierRange",
    });
  });
});