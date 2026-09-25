import type {
  ReadinessContext,
  ReadinessRule,
  ReadinessRuleResult,
} from "../types";
import {
  buildResult,
  HIGH_BLOCK,
  isEmptyText,
  PASS_INFO,
  WARN_LOW,
  WARN_MEDIUM,
} from "./helpers";

const CATEGORY = "Work Instructions";

/**
 * Rule 3 — Work Instructions
 *
 * For every required routing operation:
 *  1. Work instruction exists
 *  2. Work instruction is active
 *  3. Correct operation mapping (enforced by FK; instructions are loaded per operation)
 *  4. Required instructions are not empty
 *  5. Only the active version is used (and exactly one active version exists)
 *
 * Non-blocking note: when the routing cannot be assessed (missing routing),
 * this rule emits a WARNING instead of silently passing.
 */
export const workInstructionRule: ReadinessRule = {
  code: "WORK_INSTRUCTION",
  category: CATEGORY,
  async evaluate(ctx: ReadinessContext): Promise<ReadinessRuleResult[]> {
    const results: ReadinessRuleResult[] = [];

    if (!ctx.routing) {
      results.push(
        buildResult({
          ruleCode: "WORK_INSTRUCTION_UNVERIFIED",
          category: CATEGORY,
          status: "WARNING",
          ...WARN_LOW,
          title: "Work instructions not assessed",
          message: "No routing configuration was available, so work instructions could not be verified.",
        })
      );
      return results;
    }

    const requiredOps = ctx.routing.operations.filter((op) => op.required);
    if (requiredOps.length === 0) {
      results.push(
        buildResult({
          ruleCode: "WORK_INSTRUCTION_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "No required operations",
          message: "The routing defines no required operations, so no work instructions are needed.",
        })
      );
      return results;
    }

    let allValid = true;

    for (const op of requiredOps) {
      const instructions = ctx.workInstructionsByOperation.get(op.id) ?? [];

      if (instructions.length === 0) {
        allValid = false;
        results.push(
          buildResult({
            ruleCode: "WORK_INSTRUCTION_EXISTS",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Work instruction missing",
            message: `Missing active work instruction for operation: ${op.operationName}`,
            affectedEntityType: "RoutingOperation",
            affectedEntityId: op.id,
            remediation: `Create and activate a work instruction for ${op.operationName}.`,
          })
        );
        continue;
      }

      const active = instructions.filter((wi) => wi.status === "ACTIVE");
      if (active.length === 0) {
        allValid = false;
        results.push(
          buildResult({
            ruleCode: "WORK_INSTRUCTION_ACTIVE",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Work instruction is not active",
            message: `Work instruction exists for ${op.operationName} but none are active.`,
            affectedEntityType: "RoutingOperation",
            affectedEntityId: op.id,
            remediation: `Activate the latest version of the work instruction for ${op.operationName}.`,
          })
        );
        continue;
      }

      if (active.length > 1) {
        results.push(
          buildResult({
            ruleCode: "WORK_INSTRUCTION_MULTIPLE_ACTIVE",
            category: CATEGORY,
            status: "WARNING",
            ...WARN_MEDIUM,
            title: "Multiple active work instruction versions",
            message: `Operation ${op.operationName} has ${active.length} active work instruction versions.`,
            affectedEntityType: "RoutingOperation",
            affectedEntityId: op.id,
            remediation: "Keep exactly one active version per work instruction.",
          })
        );
      }

      for (const wi of active) {
        if (isEmptyText(wi.content)) {
          allValid = false;
          results.push(
            buildResult({
              ruleCode: "WORK_INSTRUCTION_CONTENT",
              category: CATEGORY,
              status: "FAIL",
              ...HIGH_BLOCK,
              title: "Work instruction has no content",
              message: `Active work instruction "${wi.title}" has no content.`,
              affectedEntityType: "WorkInstruction",
              affectedEntityId: wi.id,
              remediation: `Add content to "${wi.title}".`,
            })
          );
        }

        const newerVersion = instructions.some(
          (w) => w.version > wi.version && w.status === "ACTIVE"
        );
        if (newerVersion) {
          results.push(
            buildResult({
              ruleCode: "WORK_INSTRUCTION_LATEST_VERSION",
              category: CATEGORY,
              status: "WARNING",
              ...WARN_LOW,
              title: "Older work instruction version in use",
              message: `A newer active version of "${wi.title}" exists for ${op.operationName}.`,
              affectedEntityType: "WorkInstruction",
              affectedEntityId: wi.id,
              remediation: "Align all stations to the newest active version.",
            })
          );
        }
      }
    }

    if (allValid && results.length === 0) {
      results.push(
        buildResult({
          ruleCode: "WORK_INSTRUCTION_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "Work instructions are complete",
          message: `All ${requiredOps.length} required operation(s) have active work instructions.`,
        })
      );
    }

    return results;
  },
};