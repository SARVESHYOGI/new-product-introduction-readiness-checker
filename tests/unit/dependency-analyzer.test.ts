import { describe, expect, it } from "vitest";
import {
  analyzeResults,
  deriveRootBlockers,
  resultKey,
} from "@/modules/readiness/dependency-analyzer";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import { AS_OF, INPUT } from "../helpers/readiness";

function failure(overrides: Partial<ReadinessRuleResult>): ReadinessRuleResult {
  return {
    ruleCode: "FAIL",
    category: "BOM",
    status: "FAIL",
    severity: "HIGH",
    title: "failure",
    message: "failure",
    isBlocking: true,
    ...overrides,
  };
}

const OP_STATION = new Map([["op_1", "st_1"]]);

describe("Dependency analysis (root-cause)", () => {
  it("collapses station, routing, operator, and work-instruction failures into one root blocker", () => {
    const results: ReadinessRuleResult[] = [
      failure({
        ruleCode: "STATION_ACTIVE",
        category: "Stations",
        severity: "CRITICAL",
        title: "Station is inactive",
        message: "Test Station is inactive",
        affectedEntityType: "Station",
        affectedEntityId: "st_1",
      }),
      failure({
        ruleCode: "ROUTING_STATION_ACTIVE",
        category: "Routing",
        severity: "CRITICAL",
        title: "Routing station problem",
        affectedEntityType: "Station",
        affectedEntityId: "st_1",
      }),
      failure({
        ruleCode: "OPERATOR_ASSIGNED",
        category: "Operators",
        title: "No operator assigned",
        affectedEntityType: "Station",
        affectedEntityId: "st_1",
      }),
      failure({
        ruleCode: "WORK_INSTRUCTION_EXISTS",
        category: "Work Instructions",
        title: "Missing work instruction",
        affectedEntityType: "RoutingOperation",
        affectedEntityId: "op_1",
      }),
    ];

    const analyzed = analyzeResults(results, OP_STATION);
    const roots = deriveRootBlockers(analyzed);

    // Exactly one root blocker: the station.
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      ruleCode: "STATION_ACTIVE",
      category: "Stations",
      severity: "CRITICAL",
    });
    // Everything else is a consequence, not a separate blocker.
    expect(roots[0].impacts.sort()).toEqual(["Operators", "Routing", "Work Instructions"]);
  });

  it("keeps independent failures (e.g. BOM) as separate root blockers with no impacts", () => {
    const results: ReadinessRuleResult[] = [
      failure({
        ruleCode: "STATION_ACTIVE",
        category: "Stations",
        severity: "CRITICAL",
        affectedEntityType: "Station",
        affectedEntityId: "st_1",
      }),
      failure({ ruleCode: "BOM_MISSING", category: "BOM", title: "No BOM", affectedEntityType: "Product", affectedEntityId: INPUT.productId }),
    ];

    const roots = deriveRootBlockers(analyzeResults(results, OP_STATION));
    expect(roots.map((r) => r.ruleCode).sort()).toEqual(["BOM_MISSING", "STATION_ACTIVE"]);
    const bomRoot = roots.find((r) => r.ruleCode === "BOM_MISSING")!;
    expect(bomRoot.impacts).toEqual([]);
  });

  it("resultKey disambiguates repeated rule codes by affected entity", () => {
    expect(resultKey({ ruleCode: "STATION_ACTIVE", affectedEntityId: "st_1" })).toBe("STATION_ACTIVE:st_1");
    expect(resultKey({ ruleCode: "STATION_ACTIVE" })).toBe("STATION_ACTIVE");
    expect(
      resultKey({ ruleCode: "STATION_ACTIVE", affectedEntityId: "st_2" })
    ).not.toBe(resultKey({ ruleCode: "STATION_ACTIVE", affectedEntityId: "st_1" }));
  });

  it("does not link WORK_INSTRUCTION failures when the operation is unrelated to any failure", () => {
    const results: ReadinessRuleResult[] = [
      failure({
        ruleCode: "WORK_INSTRUCTION_EXISTS",
        category: "Work Instructions",
        affectedEntityType: "RoutingOperation",
        affectedEntityId: "op_9",
      }),
    ];
    const analyzed = analyzeResults(results, OP_STATION);
    expect(analyzed[0].causeRuleCode).toBeUndefined();
    expect(deriveRootBlockers(analyzed)).toHaveLength(1);
  });

  it("chains consequences transitively through the persisted cause keys", () => {
    const results: ReadinessRuleResult[] = [
      failure({
        ruleCode: "STATION_ACTIVE",
        category: "Stations",
        severity: "CRITICAL",
        affectedEntityType: "Station",
        affectedEntityId: "st_1",
      }),
      failure({
        ruleCode: "OPERATOR_ASSIGNED",
        category: "Operators",
        affectedEntityType: "Station",
        affectedEntityId: "st_1",
      }),
    ];
    void AS_OF; // referenced for clarity in failures above
    const analyzed = analyzeResults(results, OP_STATION);
    const operatorResult = analyzed.find((r) => r.category === "Operators")!;
    expect(operatorResult.causeRuleCode).toBe("STATION_ACTIVE:st_1");

    // Persisted results (immutable) re-derive the same root blocker.
    const roots = deriveRootBlockers(analyzed);
    expect(roots).toHaveLength(1);
    expect(roots[0].impacts).toEqual(["Operators"]);
  });
});