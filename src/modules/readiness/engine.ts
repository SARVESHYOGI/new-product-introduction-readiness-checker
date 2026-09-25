import { logger } from "@/lib/logging/logger";
import type {
  ReadinessCheckInput,
  ReadinessContext,
  ReadinessContextLoader,
  ReadinessOutcome,
  ReadinessRule,
  ReadinessRuleResult,
} from "./types";
import { readinessRules } from "./rules";
import { analyzeResults, deriveRootBlockers } from "./dependency-analyzer";
import { buildOutcome } from "./scoring";

export const SAFETY_CATEGORY = "Safety";
export const S1_RULE_CODE = "S1_VERIFICATION_FAILED";

export const VERIFICATION_BLOCKED_MESSAGE =
  "Unable to verify critical production configuration. Production readiness cannot be confirmed.";

/**
 * The single canonical fail-safe result (Safety Rule 1). Exported so the
 * service layer can persist the same outcome when its own preflight — not just
 * the engine — fails to verify the configuration.
 */
export function verificationFailure(
  message: string = VERIFICATION_BLOCKED_MESSAGE
): ReadinessRuleResult {
  return {
    ruleCode: S1_RULE_CODE,
    category: SAFETY_CATEGORY,
    status: "FAIL",
    severity: "CRITICAL",
    title: "Production configuration could not be verified",
    message,
    isBlocking: true,
  };
}

/**
 * Deterministic, fail-safe readiness engine.
 *
 * Safety Rule 1: if the configuration cannot be verified (database error,
 * timeout, corrupted data, unexpected rule error), the engine NEVER assumes
 * PASS — it returns BLOCKED with "Unable to verify critical production
 * configuration. Production readiness cannot be confirmed."
 *
 * The engine is the single source of truth for the readiness decision; an AI
 * or LLM is never allowed to override it.
 */
export class ReadinessEngine {
  constructor(
    private readonly loader: ReadinessContextLoader,
    private readonly rules: ReadinessRule[] = readinessRules,
    private readonly now: () => Date = () => new Date()
  ) {}

  async run(input: ReadinessCheckInput): Promise<ReadinessOutcome> {
    const asOf = this.now();

    let context: ReadinessContext;
    try {
      context = await this.loader.load(input, asOf);
    } catch (err) {
      logger.error("readiness_context_load_failed", {
        productId: input.productId,
        bomVersionId: input.bomVersionId,
        routingId: input.routingId,
        lineId: input.lineId,
        error: err instanceof Error ? err.message : String(err),
      });
      const blocked = [verificationFailure()];
      return buildOutcome(blocked, []);
    }

    const results: ReadinessRuleResult[] = [];
    for (const rule of this.rules) {
      try {
        const ruleResults = await rule.evaluate(context);
        results.push(...ruleResults);
      } catch (err) {
        // A rule that crashes must never become a silent PASS.
        logger.error("readiness_rule_failed", {
          rule: rule.code,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push(
          verificationFailure(
            `Verification of ${rule.category} failed. ${VERIFICATION_BLOCKED_MESSAGE}`
          )
        );
      }
    }

    const opStation = new Map<string, string>();
    for (const op of context.routing?.operations ?? []) {
      if (op.stationId) opStation.set(op.id, op.stationId);
    }

    const analyzed = analyzeResults(results, opStation);
    const rootBlockers = deriveRootBlockers(analyzed);
    return buildOutcome(analyzed, rootBlockers);
  }
}