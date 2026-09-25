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
  windowContains,
} from "./helpers";

const CATEGORY = "Operators";

/**
 * Rule 6 — Operator Assignment
 *
 * For every required station (referenced by a required routing operation):
 *  1. Station has at least one eligible operator
 *  2. Operator is active
 *  3. Assignment is currently valid (window contains the check time)
 *  4. Assignment is not expired (Safety S4)
 *  5. Operator is not assigned to an inactive station (reported by Station rule;
 *     failures here are linked there as consequences by the dependency analyzer)
 *
 * Not assessed (WARNING) when there is no routing to inspect.
 */
export const operatorRule: ReadinessRule = {
  code: "OPERATOR",
  category: CATEGORY,
  async evaluate(ctx: ReadinessContext): Promise<ReadinessRuleResult[]> {
    const results: ReadinessRuleResult[] = [];

    if (!ctx.routing) {
      results.push(
        buildResult({
          ruleCode: "OPERATOR_UNVERIFIED",
          category: CATEGORY,
          status: "WARNING",
          ...WARN_LOW,
          title: "Operator assignment not assessed",
          message: "No routing configuration was available, so operator assignments could not be verified.",
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
          ruleCode: "OPERATOR_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "No required stations",
          message: "The routing defines no required operations with stations, so no operators are needed.",
        })
      );
      return results;
    }

    let allValid = true;

    for (const stationId of stationIds) {
      const station = ctx.stationsById.get(stationId);
      if (!station) {
        // The routing/station rules flag the missing station; nothing to check here.
        continue;
      }

      const assignments = ctx.operatorAssignments.filter(
        (a) => a.stationId === stationId
      );

      if (assignments.length === 0) {
        allValid = false;
        results.push(
          buildResult({
            ruleCode: "OPERATOR_ASSIGNED",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "No operator assigned",
            message: `No active operator assigned to ${station.name}.`,
            affectedEntityType: "Station",
            affectedEntityId: station.id,
            remediation: `Assign an active operator to ${station.name}.`,
          })
        );
        continue;
      }

      const hasValidAssignment = assignments.some((a) =>
        isValidAssignment(a, ctx.asOf)
      );

      if (hasValidAssignment) continue;

      // None of the assignments is currently valid — explain the most concrete
      // reason per assignment so the exact entity is identified.
      for (const a of assignments) {
        if (!windowContains(a.validFrom, a.validTo, ctx.asOf)) {
          allValid = false;
          const reason =
            a.validTo.getTime() < ctx.asOf.getTime()
              ? "has expired"
              : "has not yet started";
          results.push(
            buildResult({
              ruleCode: "OPERATOR_ASSIGNMENT_VALID",
              category: CATEGORY,
              status: "FAIL",
              ...CRITICAL_BLOCK,
              title: "Operator assignment is not currently valid",
              message: `Operator ${a.operator?.name ?? a.operatorId}'s assignment to ${station.name} ${reason}.`,
              affectedEntityType: "OperatorStationAssignment",
              affectedEntityId: a.id,
              remediation: `Renew or replace the assignment for ${station.name} so it is valid now.`,
            })
          );
        } else if (a.status === "EXPIRED" || a.status === "REVOKED") {
          allValid = false;
          results.push(
            buildResult({
              ruleCode: "OPERATOR_ASSIGNMENT_EXPIRED",
              category: CATEGORY,
              status: "FAIL",
              ...CRITICAL_BLOCK,
              title: "Operator assignment is expired or revoked",
              message: `Operator ${a.operator?.name ?? a.operatorId}'s assignment to ${station.name} is ${a.status.toLowerCase()}.`,
              affectedEntityType: "OperatorStationAssignment",
              affectedEntityId: a.id,
              remediation: `Create a new ACTIVE assignment for ${station.name}.`,
            })
          );
        } else if (a.operator && a.operator.status !== "ACTIVE") {
          allValid = false;
          results.push(
            buildResult({
              ruleCode: "OPERATOR_ACTIVE",
              category: CATEGORY,
              status: "FAIL",
              ...HIGH_BLOCK,
              title: "Assigned operator is not active",
              message: `Assigned operator ${a.operator.name} is not active (${a.operator.status}).`,
              affectedEntityType: "Operator",
              affectedEntityId: a.operator.id,
              remediation: `Activate operator ${a.operator.name} or assign another active operator to ${station.name}.`,
            })
          );
        } else {
          // Assignment record exists but does not satisfy validity — catch-all.
          allValid = false;
          results.push(
            buildResult({
              ruleCode: "OPERATOR_ASSIGNED",
              category: CATEGORY,
              status: "FAIL",
              ...HIGH_BLOCK,
              title: "No valid operator assignment",
              message: `${station.name} has no currently valid operator assignment.`,
              affectedEntityType: "Station",
              affectedEntityId: station.id,
              remediation: `Assign an active operator to ${station.name}.`,
            })
          );
        }
      }
    }

    if (allValid && results.length === 0) {
      results.push(
        buildResult({
          ruleCode: "OPERATOR_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "Operators are assigned",
          message: `All ${stationIds.length} required station(s) have a valid, active operator.`,
        })
      );
    }

    return results;
  },
};

function isValidAssignment(
  a: { status: string; validFrom: Date; validTo: Date; operator: { status: string } | null },
  asOf: Date
): boolean {
  return (
    a.status === "ACTIVE" &&
    windowContains(a.validFrom, a.validTo, asOf) &&
    a.operator?.status === "ACTIVE"
  );
}