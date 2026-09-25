import { describe, expect, it } from "vitest";
import { operatorRule } from "@/modules/readiness/rules/operator";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import {
  baseContext,
  assignment,
  operator,
  station,
} from "../helpers/readiness";

function find(results: ReadinessRuleResult[], code: string) {
  return results.find((r) => r.ruleCode === code);
}

const VALID_WINDOW = {
  validFrom: new Date("2025-01-01T00:00:00Z"),
  validTo: new Date("2030-12-31T23:59:59Z"),
};

describe("Rule 6 — Operator Assignment", () => {
  it("returns PASS when every required station has a valid active operator", async () => {
    const results = await operatorRule.evaluate(baseContext());
    expect(find(results, "OPERATOR_OK")).toMatchObject({ status: "PASS" });
  });

  it("WARNs (unverified) when there is no routing to assess", async () => {
    const results = await operatorRule.evaluate(baseContext({ routing: null }));
    expect(find(results, "OPERATOR_UNVERIFIED")).toMatchObject({
      status: "WARNING",
      isBlocking: false,
    });
  });

  it("FAILs when a required station has no operator", async () => {
    const st = station();
    const results = await operatorRule.evaluate(
      baseContext({
        operatorAssignments: [],
      })
    );
    const result = find(results, "OPERATOR_ASSIGNED");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
      affectedEntityType: "Station",
      affectedEntityId: st.id,
    });
    expect(result?.message).toContain(st.name);
  });

  it("FAILs (CRITICAL, Safety S4) when the only assignment has expired", async () => {
    const expired = new Date("2025-01-01T00:00:00Z");
    const results = await operatorRule.evaluate(
      baseContext({
        operatorAssignments: [
          assignment({
            id: "asg_expired",
            validFrom: new Date("2024-01-01T00:00:00Z"),
            validTo: expired,
            status: "ACTIVE",
          }),
        ],
      })
    );
    const result = find(results, "OPERATOR_ASSIGNMENT_VALID");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
      affectedEntityType: "OperatorStationAssignment",
    });
    expect(result?.message).toContain("has expired");
  });

  it("FAILs (CRITICAL, Safety S4) on an EXPIRED-status assignment inside its window", async () => {
    const results = await operatorRule.evaluate(
      baseContext({
        operatorAssignments: [assignment({ ...VALID_WINDOW, status: "EXPIRED" })],
      })
    );
    expect(find(results, "OPERATOR_ASSIGNMENT_EXPIRED")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("FAILs when the assigned operator is not active", async () => {
    const results = await operatorRule.evaluate(
      baseContext({
        operatorAssignments: [
          assignment({ ...VALID_WINDOW, operator: operator({ status: "INACTIVE" }) }),
        ],
      })
    );
    expect(find(results, "OPERATOR_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
      affectedEntityType: "Operator",
    });
  });

  it("PASSes when one valid assignment exists alongside an expired one", async () => {
    const results = await operatorRule.evaluate(
      baseContext({
        operatorAssignments: [
          assignment({
            id: "asg_valid",
            ...VALID_WINDOW,
            operator: operator(),
          }),
          assignment({
            id: "asg_expired",
            validFrom: new Date("2024-01-01T00:00:00Z"),
            validTo: new Date("2025-01-01T00:00:00Z"),
            status: "ACTIVE",
            operator: operator({ id: "op_002", employeeCode: "OP-002" }),
          }),
        ],
      })
    );
    expect(find(results, "OPERATOR_OK")).toMatchObject({ status: "PASS" });
  });
});