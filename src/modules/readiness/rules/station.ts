import type {
  ReadinessContext,
  ReadinessRule,
  ReadinessRuleResult,
} from "../types";
import {
  buildResult,
  CRITICAL_BLOCK,
  PASS_INFO,
  WARN_LOW,
  WARN_MEDIUM,
} from "./helpers";

const CATEGORY = "Stations";

/**
 * Rule 7 — Station Configuration
 *
 * Checks (for every station required by the routing):
 *  1. Station exists (missing references are reported here as corrupted config)
 *  2. Station is active
 *  3. Station belongs to selected line
 *  4. Required capabilities exist (warning when none declared)
 *  5. Station is not in maintenance (Safety S5)
 *  6. Every required routing operation has exactly one valid station
 *     (enforced by the single stationId FK; verified through the routing rule)
 *
 * Inactive/maintenance stations and wrong-line assignments are CRITICAL and
 * block production (fail-safe per Safety Rules 2 & 5).
 */
export const stationRule: ReadinessRule = {
  code: "STATION",
  category: CATEGORY,
  async evaluate(ctx: ReadinessContext): Promise<ReadinessRuleResult[]> {
    const results: ReadinessRuleResult[] = [];

    if (!ctx.routing) {
      results.push(
        buildResult({
          ruleCode: "STATION_UNVERIFIED",
          category: CATEGORY,
          status: "WARNING",
          ...WARN_LOW,
          title: "Stations not assessed",
          message: "No routing configuration was available, so stations could not be verified.",
        })
      );
      return results;
    }

    const requiredOps = ctx.routing.operations.filter(
      (op) => op.required && op.stationId
    );
    const stationIds = [...new Set(requiredOps.map((op) => op.stationId!))];

    if (stationIds.length === 0) {
      results.push(
        buildResult({
          ruleCode: "STATION_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "No required stations",
          message: "The routing defines no required operations with stations.",
        })
      );
      return results;
    }

    let allValid = true;

    for (const stationId of stationIds) {
      const station = ctx.stationsById.get(stationId);
      if (!station) {
        // The routing rule reports ROUTING_STATION_MISSING (CRITICAL) for a
        // dangling reference; report it here too as the station-discipline root.
        allValid = false;
        results.push(
          buildResult({
            ruleCode: "STATION_EXISTS",
            category: CATEGORY,
            status: "FAIL",
            ...CRITICAL_BLOCK,
            title: "Required station does not exist",
            message: "A required routing operation references a station that does not exist.",
            affectedEntityType: "Station",
            affectedEntityId: stationId,
            remediation: "Repair the station reference or create the missing station.",
          })
        );
        continue;
      }

      if (station.status === "MAINTENANCE") {
        allValid = false;
        results.push(
          buildResult({
            ruleCode: "STATION_MAINTENANCE",
            category: CATEGORY,
            status: "FAIL",
            ...CRITICAL_BLOCK,
            title: "Station is under maintenance",
            message: `${station.name} is under maintenance and cannot be used for production.`,
            affectedEntityType: "Station",
            affectedEntityId: station.id,
            remediation: `Complete maintenance on ${station.name} and return it to ACTIVE status.`,
          })
        );
      } else if (station.status === "INACTIVE") {
        allValid = false;
        results.push(
          buildResult({
            ruleCode: "STATION_ACTIVE",
            category: CATEGORY,
            status: "FAIL",
            ...CRITICAL_BLOCK,
            title: "Station is inactive",
            message: `${station.name} is inactive. Production readiness cannot be confirmed.`,
            affectedEntityType: "Station",
            affectedEntityId: station.id,
            remediation: `Reactivate ${station.name} before production.`,
          })
        );
      }

      if (station.lineId !== ctx.input.lineId) {
        allValid = false;
        results.push(
          buildResult({
            ruleCode: "STATION_LINE_MATCH",
            category: CATEGORY,
            status: "FAIL",
            ...CRITICAL_BLOCK,
            title: "Station belongs to a different line",
            message: `${station.name} is assigned to ${
              station.line?.name ?? "another line"
            } but the selected line is ${
              ctx.line?.name ?? ctx.input.lineId
            }.`,
            affectedEntityType: "Station",
            affectedEntityId: station.id,
            remediation: `Assign ${station.name} to the selected production line.`,
          })
        );
      }

      if ((station.capabilities ?? []).length === 0) {
        results.push(
          buildResult({
            ruleCode: "STATION_CAPABILITIES",
            category: CATEGORY,
            status: "WARNING",
            ...WARN_MEDIUM,
            title: "Station has no capabilities defined",
            message: `${station.name} has no capabilities defined.`,
            affectedEntityType: "Station",
            affectedEntityId: station.id,
            remediation: `Declare the capabilities of ${station.name}.`,
          })
        );
      }
    }

    if (allValid && results.length === 0) {
      results.push(
        buildResult({
          ruleCode: "STATION_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "Stations are configured",
          message: `All ${stationIds.length} required station(s) are active and on the selected line.`,
        })
      );
    }

    return results;
  },
};