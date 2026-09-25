import type {
  ReadinessContext,
  ReadinessRule,
  ReadinessRuleResult,
} from "../types";
import {
  buildResult,
  CRITICAL_BLOCK,
  HIGH_BLOCK,
  PASS_INFO,
  WARN_LOW,
  WARN_MEDIUM,
} from "./helpers";

const CATEGORY = "Routing";

/**
 * Rule 2 — Routing
 *
 * Checks:
 *  1. Routing exists
 *  2. Routing is active
 *  3. Routing belongs to selected product
 *  4. Routing has operations
 *  5. Sequence numbers are valid (> 0)
 *  6. No duplicate sequence numbers
 *  7. Every required operation has a station
 *  8. Station is active
 *  9. Station belongs to selected line
 * 10. Cycle time is valid
 *
 * Safety (S2/S5): a routing that references an inactive or maintenance station,
 * or a station on another line, is a conflicting configuration → CRITICAL.
 */
export const routingRule: ReadinessRule = {
  code: "ROUTING",
  category: CATEGORY,
  async evaluate(ctx: ReadinessContext): Promise<ReadinessRuleResult[]> {
    const results: ReadinessRuleResult[] = [];
    const routing = ctx.routing;

    if (!routing) {
      results.push(
        buildResult({
          ruleCode: "ROUTING_EXISTS",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "Routing does not exist",
          message: "Routing does not exist for the selected configuration.",
          remediation: "Create and activate a routing for this product.",
        })
      );
      return results;
    }

    // Safety S3 — duplicate active configuration.
    const activeRoutings = ctx.productRoutings.filter((r) => r.status === "ACTIVE");
    if (activeRoutings.length > 1) {
      results.push(
        buildResult({
          ruleCode: "ROUTING_ACTIVE_DUPLICATE",
          category: CATEGORY,
          status: "FAIL",
          ...CRITICAL_BLOCK,
          title: "Multiple active routings",
          message: `Product has ${activeRoutings.length} active routings (${activeRoutings
            .map((r) => r.code)
            .join(", ")}). Exactly one active routing is allowed.`,
          affectedEntityType: "Product",
          affectedEntityId: ctx.input.productId,
          remediation: "Set all but one routing to OBSOLETE.",
        })
      );
    }

    if (routing.productId !== ctx.input.productId) {
      results.push(
        buildResult({
          ruleCode: "ROUTING_PRODUCT_MATCH",
          category: CATEGORY,
          status: "FAIL",
          ...CRITICAL_BLOCK,
          title: "Routing does not belong to the selected product",
          message: `Routing ${routing.code} belongs to a different product than the one selected.`,
          affectedEntityType: "Routing",
          affectedEntityId: routing.id,
          remediation: "Select a routing that belongs to the selected product.",
        })
      );
    }

    if (routing.status !== "ACTIVE") {
      results.push(
        buildResult({
          ruleCode: "ROUTING_ACTIVE",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "Routing is not active",
          message: `Routing exists but is not active (current status: ${routing.status}).`,
          affectedEntityType: "Routing",
          affectedEntityId: routing.id,
          remediation: `Activate routing ${routing.code} to make it eligible for production.`,
        })
      );
    }

    if (routing.operations.length === 0) {
      results.push(
        buildResult({
          ruleCode: "ROUTING_HAS_OPERATIONS",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "Routing has no operations",
          message: `Routing ${routing.code} has no operations defined.`,
          affectedEntityType: "Routing",
          affectedEntityId: routing.id,
          remediation: "Define at least one required operation for this routing.",
        })
      );
    }

    const seenSequences = new Set<number>();
    for (const op of routing.operations) {
      if (op.sequence <= 0) {
        results.push(
          buildResult({
            ruleCode: "ROUTING_SEQUENCE_VALID",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Invalid operation sequence",
            message: `Operation ${op.operationName} has an invalid sequence number (${op.sequence}).`,
            affectedEntityType: "RoutingOperation",
            affectedEntityId: op.id,
            remediation: "Use a positive, unique sequence number.",
          })
        );
      }
      if (seenSequences.has(op.sequence)) {
        results.push(
          buildResult({
            ruleCode: "ROUTING_SEQUENCE_DUPLICATE",
            category: CATEGORY,
            status: "FAIL",
            ...CRITICAL_BLOCK,
            title: "Duplicate operation sequence",
            message: `Sequence ${op.sequence} is used more than once in routing ${routing.code}.`,
            affectedEntityType: "RoutingOperation",
            affectedEntityId: op.id,
            remediation: "Assign unique sequence numbers to every operation.",
          })
        );
      }
      seenSequences.add(op.sequence);

      if (op.standardCycleTimeSeconds == null) {
        results.push(
          buildResult({
            ruleCode: "ROUTING_CYCLE_TIME_VALID",
            category: CATEGORY,
            status: "WARNING",
            ...WARN_LOW,
            title: "Cycle time is not defined",
            message: `Operation ${op.operationName} has no standard cycle time defined.`,
            affectedEntityType: "RoutingOperation",
            affectedEntityId: op.id,
          })
        );
      } else if (op.standardCycleTimeSeconds <= 0) {
        results.push(
          buildResult({
            ruleCode: "ROUTING_CYCLE_TIME_VALID",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Invalid cycle time",
            message: `Operation ${op.operationName} has an invalid cycle time (${op.standardCycleTimeSeconds}s).`,
            affectedEntityType: "RoutingOperation",
            affectedEntityId: op.id,
            remediation: "Set a positive standard cycle time for the operation.",
          })
        );
      }

      const station = op.station;
      if (!op.stationId) {
        if (op.required) {
          results.push(
            buildResult({
              ruleCode: "ROUTING_OPERATION_STATION",
              category: CATEGORY,
              status: "FAIL",
              ...HIGH_BLOCK,
              title: "Required operation has no station",
              message: `Required operation ${op.operationName} has no station assigned.`,
              affectedEntityType: "RoutingOperation",
              affectedEntityId: op.id,
              remediation: `Assign a valid station to operation ${op.operationName}.`,
            })
          );
        } else {
          results.push(
            buildResult({
              ruleCode: "ROUTING_OPERATION_STATION",
              category: CATEGORY,
              status: "WARNING",
              ...WARN_MEDIUM,
              title: "Optional operation has no station",
              message: `Optional operation ${op.operationName} has no station assigned.`,
              affectedEntityType: "RoutingOperation",
              affectedEntityId: op.id,
            })
          );
        }
      } else if (!station) {
        results.push(
          buildResult({
            ruleCode: "ROUTING_STATION_MISSING",
            category: CATEGORY,
            status: "FAIL",
            ...CRITICAL_BLOCK,
            title: "Referenced station does not exist",
            message: `Operation ${op.operationName} references a station that does not exist.`,
            affectedEntityType: "Station",
            affectedEntityId: op.stationId,
            remediation: "Repair the station reference on the operation.",
          })
        );
      } else {
        if (station.status !== "ACTIVE") {
          const detail =
            station.status === "MAINTENANCE"
              ? "is under maintenance"
              : "is inactive";
          results.push(
            buildResult({
              ruleCode: "ROUTING_STATION_ACTIVE",
              category: CATEGORY,
              status: "FAIL",
              ...CRITICAL_BLOCK,
              title: "Station is not production ready",
              message: `Routing requires ${station.name}, but the station ${detail}.`,
              affectedEntityType: "Station",
              affectedEntityId: station.id,
              remediation: `Return ${station.name} to ACTIVE status before production.`,
            })
          );
        }
        if (station.lineId !== ctx.input.lineId) {
          results.push(
            buildResult({
              ruleCode: "ROUTING_STATION_LINE",
              category: CATEGORY,
              status: "FAIL",
              ...CRITICAL_BLOCK,
              title: "Station belongs to a different line",
              message: `Routing requires ${station.name}, but the station is assigned to a different production line than the one selected.`,
              affectedEntityType: "Station",
              affectedEntityId: station.id,
              remediation: `Move ${station.name} to the selected production line, or select the correct line.`,
            })
          );
        }
      }
    }

    if (results.length === 0) {
      results.push(
        buildResult({
          ruleCode: "ROUTING_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "Routing is active and valid",
          message: `Routing ${routing.code} is active with ${routing.operations.length} operation(s).`,
        })
      );
    }

    return results;
  },
};