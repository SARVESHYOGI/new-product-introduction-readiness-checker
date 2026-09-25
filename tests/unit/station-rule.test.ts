import { describe, expect, it } from "vitest";
import { stationRule } from "@/modules/readiness/rules/station";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import {
  baseContext,
  operation,
  station,
} from "../helpers/readiness";

function find(results: ReadinessRuleResult[], code: string) {
  return results.find((r) => r.ruleCode === code);
}

describe("Rule 7 — Station Configuration", () => {
  it("returns PASS when every required station is active and on the selected line", async () => {
    const results = await stationRule.evaluate(baseContext());
    expect(find(results, "STATION_OK")).toMatchObject({ status: "PASS", category: "Stations" });
  });

  it("WARNs (unverified) when there is no routing to assess", async () => {
    const results = await stationRule.evaluate(baseContext({ routing: null }));
    expect(find(results, "STATION_UNVERIFIED")).toMatchObject({
      status: "WARNING",
      isBlocking: false,
    });
  });

  it("FAILs (CRITICAL, Safety S5) when the station is under maintenance", async () => {
    const st = station({ status: "MAINTENANCE" });
    const results = await stationRule.evaluate(
      baseContext({
        routing: {
          ...baseContext().routing!,
          operations: [operation({ stationId: st.id, station: st })],
        },
        stationsById: new Map([[st.id, st]]),
      })
    );
    const result = find(results, "STATION_MAINTENANCE");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
      affectedEntityType: "Station",
      affectedEntityId: st.id,
    });
  });

  it("FAILs (CRITICAL) when the station is inactive", async () => {
    const st = station({ status: "INACTIVE" });
    const results = await stationRule.evaluate(
      baseContext({
        routing: {
          ...baseContext().routing!,
          operations: [operation({ stationId: st.id, station: st })],
        },
        stationsById: new Map([[st.id, st]]),
      })
    );
    expect(find(results, "STATION_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when the station is on the wrong line", async () => {
    const st = station({ lineId: "line_other", line: { id: "line_other", code: "L2", name: "Other Line", status: "ACTIVE" } });
    const results = await stationRule.evaluate(
      baseContext({
        routing: {
          ...baseContext().routing!,
          operations: [operation({ stationId: st.id, station: st })],
        },
        stationsById: new Map([[st.id, st]]),
      })
    );
    expect(find(results, "STATION_LINE_MATCH")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when the referenced station does not exist", async () => {
    const results = await stationRule.evaluate(
      baseContext({
        routing: {
          ...baseContext().routing!,
          operations: [operation({ id: "op_missing", stationId: "st_GHOST", station: null })],
        },
        stationsById: new Map(),
      })
    );
    expect(find(results, "STATION_EXISTS")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
      affectedEntityId: "st_GHOST",
    });
  });

  it("WARNs when a station has no declared capabilities", async () => {
    const st = station({ capabilities: [] });
    const results = await stationRule.evaluate(
      baseContext({
        routing: {
          ...baseContext().routing!,
          operations: [operation({ stationId: st.id, station: st })],
        },
        stationsById: new Map([[st.id, st]]),
      })
    );
    expect(find(results, "STATION_CAPABILITIES")).toMatchObject({
      status: "WARNING",
      severity: "MEDIUM",
      isBlocking: false,
    });
    // A missing-capability warning alone must not fail the category.
    expect(find(results, "STATION_OK")).toBeFalsy();
    expect(find(results, "STATION_CAPABILITIES")).toBeTruthy();
  });
});