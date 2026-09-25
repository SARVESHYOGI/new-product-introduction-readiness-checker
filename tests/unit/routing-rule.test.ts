import { describe, expect, it } from "vitest";
import { routingRule } from "@/modules/readiness/rules/routing";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import {
  baseContext,
  operation,
  routing,
  station,
} from "../helpers/readiness";

function find(results: ReadinessRuleResult[], code: string) {
  return results.find((r) => r.ruleCode === code);
}

describe("Rule 2 — Routing", () => {
  it("returns a single PASS for an active routing with valid operations", async () => {
    const results = await routingRule.evaluate(baseContext());
    expect(results.filter((r) => r.status === "PASS")).toHaveLength(1);
    expect(results[0]).toMatchObject({ ruleCode: "ROUTING_OK", status: "PASS" });
  });

  it("FAILs when the routing does not exist", async () => {
    const results = await routingRule.evaluate(baseContext({ routing: null }));
    expect(find(results, "ROUTING_EXISTS")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs when the routing is not active", async () => {
    const results = await routingRule.evaluate(
      baseContext({ routing: routing({ status: "DRAFT", operations: [] }) })
    );
    expect(find(results, "ROUTING_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when the routing does not belong to the selected product", async () => {
    const results = await routingRule.evaluate(
      baseContext({ routing: routing({ productId: "prod_other", operations: [] }) })
    );
    expect(find(results, "ROUTING_PRODUCT_MATCH")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("FAILs when the routing has no operations", async () => {
    const results = await routingRule.evaluate(baseContext({ routing: routing({ operations: [] }) }));
    expect(find(results, "ROUTING_HAS_OPERATIONS")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when a required operation has no station", async () => {
    const results = await routingRule.evaluate(
      baseContext({
        routing: routing({
          operations: [operation({ id: "op_1", stationId: null, station: null })],
        }),
      })
    );
    expect(find(results, "ROUTING_OPERATION_STATION")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
      affectedEntityType: "RoutingOperation",
    });
  });

  it("FAILs (CRITICAL) when the referenced station is inactive", async () => {
    const st = station({ status: "INACTIVE" });
    const results = await routingRule.evaluate(
      baseContext({
        routing: routing({ operations: [operation({ stationId: st.id, station: st })] }),
        stationsById: new Map([[st.id, st]]),
      })
    );
    const result = find(results, "ROUTING_STATION_ACTIVE");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
      affectedEntityType: "Station",
    });
    expect(result?.message).toContain("is inactive");
  });

  it("FAILs (CRITICAL) when the referenced station is under maintenance", async () => {
    const st = station({ status: "MAINTENANCE" });
    const results = await routingRule.evaluate(
      baseContext({
        routing: routing({ operations: [operation({ stationId: st.id, station: st })] }),
        stationsById: new Map([[st.id, st]]),
      })
    );
    const result = find(results, "ROUTING_STATION_ACTIVE");
    expect(result?.message).toContain("under maintenance");
  });

  it("FAILs (CRITICAL) when the station belongs to a different line", async () => {
    const st = station({ lineId: "line_other" });
    const results = await routingRule.evaluate(
      baseContext({
        routing: routing({ operations: [operation({ stationId: st.id, station: st })] }),
        stationsById: new Map([[st.id, st]]),
      })
    );
    expect(find(results, "ROUTING_STATION_LINE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) on duplicate operation sequences", async () => {
    const results = await routingRule.evaluate(
      baseContext({
        routing: routing({
          operations: [
            operation({ id: "op_1", sequence: 10 }),
            operation({ id: "op_2", sequence: 10 }),
          ],
        }),
      })
    );
    expect(find(results, "ROUTING_SEQUENCE_DUPLICATE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("WARNs when the cycle time is missing and FAILs when negative", async () => {
    const missing = await routingRule.evaluate(
      baseContext({ routing: routing({ operations: [operation({ standardCycleTimeSeconds: null })] }) })
    );
    expect(find(missing, "ROUTING_CYCLE_TIME_VALID")).toMatchObject({
      status: "WARNING",
      isBlocking: false,
    });

    const invalid = await routingRule.evaluate(
      baseContext({ routing: routing({ operations: [operation({ standardCycleTimeSeconds: -5 })] }) })
    );
    expect(find(invalid, "ROUTING_CYCLE_TIME_VALID")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when multiple active routings exist (Safety S3)", async () => {
    const results = await routingRule.evaluate(
      baseContext({
        routing: routing({ operations: [] }),
        productRoutings: [
          { id: "route_1", code: "R1", status: "ACTIVE" },
          { id: "route_2", code: "R2", status: "ACTIVE" },
        ],
      })
    );
    expect(find(results, "ROUTING_ACTIVE_DUPLICATE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });
});