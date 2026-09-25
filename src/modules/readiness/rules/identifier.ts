import type {
  ReadinessContext,
  ReadinessRule,
  ReadinessRuleResult,
} from "../types";
import {
  buildResult,
  CRITICAL_BLOCK,
  HIGH_BLOCK,
  isEmptyText,
  PASS_INFO,
  WARN_LOW,
} from "./helpers";

const CATEGORY = "Identifier Range";

/**
 * Rule 4 — Identifier Range
 *
 * Checks:
 *  1. Identifier range exists
 *  2. Range is active
 *  3. Prefix exists
 *  4. Start number < end number
 *  5. Current number is within range
 *  6. Range belongs to selected product (loaded per product; enforced here)
 *  7. No overlapping active ranges for the same product
 *
 * Integrity/safety: overlapping ranges or out-of-range counters would let two
 * finished goods share a serial — a CRITICAL, blocking failure.
 */
export const identifierRule: ReadinessRule = {
  code: "IDENTIFIER",
  category: CATEGORY,
  async evaluate(ctx: ReadinessContext): Promise<ReadinessRuleResult[]> {
    const results: ReadinessRuleResult[] = [];
    const ranges = ctx.identifierRanges;

    if (ranges.length === 0) {
      results.push(
        buildResult({
          ruleCode: "IDENTIFIER_RANGE_EXISTS",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "No identifier range configured",
          message: "No identifier range is configured for this product.",
          affectedEntityType: "Product",
          affectedEntityId: ctx.input.productId,
          remediation: "Create an active identifier range for the product.",
        })
      );
      return results;
    }

    // Safety S3 — multiple overlapping active ranges for the same product.
    const active = ranges.filter((r) => r.status === "ACTIVE");
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]!;
        const b = active[j]!;
        const overlap =
          a.startNumber <= b.endNumber && b.startNumber <= a.endNumber;
        if (overlap) {
          results.push(
            buildResult({
              ruleCode: "IDENTIFIER_RANGE_OVERLAP",
              category: CATEGORY,
              status: "FAIL",
              ...CRITICAL_BLOCK,
              title: "Overlapping identifier ranges",
              message: `Active ranges ${a.prefix} (${a.startNumber}-${a.endNumber}) and ${b.prefix} (${b.startNumber}-${b.endNumber}) overlap.`,
              affectedEntityType: "IdentifierRange",
              affectedEntityId: `${a.id},${b.id}`,
              remediation:
                "Collapse overlapping ranges into a single non-overlapping range for the product.",
            })
          );
        }
      }
    }

    if (active.length === 0) {
      const allExhausted = ranges.every((r) => r.status === "EXHAUSTED");
      results.push(
        buildResult({
          ruleCode: "IDENTIFIER_RANGE_ACTIVE",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "No active identifier range",
          message: allExhausted
            ? "Every identifier range for this product is exhausted, so no new serial can be issued."
            : "Identifier ranges exist but none are active.",
          affectedEntityType: "Product",
          affectedEntityId: ctx.input.productId,
          remediation: allExhausted
            ? "Create a new active identifier range for the product."
            : "Activate an identifier range for the product.",
        })
      );
    }

    for (const range of ranges) {
      // An anomaly in an active range is a production blocker: serials are
      // handed out from it right now. The same anomaly in an archived range is
      // a data-hygiene warning only — history cannot be rewritten, and an old
      // block does not issue new serials.
      const isActive = range.status === "ACTIVE";
      const anomaly = isActive ? CRITICAL_BLOCK : WARN_LOW;
      const rangeLabel = `${range.prefix} (${range.startNumber}-${range.endNumber}, ${range.status})`;

      if (isEmptyText(range.prefix)) {
        results.push(
          buildResult({
            ruleCode: "IDENTIFIER_PREFIX",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Identifier range has no prefix",
            message: "An identifier range has an empty prefix.",
            affectedEntityType: "IdentifierRange",
            affectedEntityId: range.id,
            remediation: "Set a prefix for the identifier range.",
          })
        );
      }

      if (range.startNumber >= range.endNumber) {
        results.push(
          buildResult({
            ruleCode: "IDENTIFIER_RANGE_BOUNDS",
            category: CATEGORY,
            status: "FAIL",
            ...anomaly,
            title: "Invalid identifier range bounds",
            message: `Range ${rangeLabel} has start (${range.startNumber}) >= end (${range.endNumber}).`,
            affectedEntityType: "IdentifierRange",
            affectedEntityId: range.id,
            remediation: "Set start number strictly below end number.",
          })
        );
      }

      if (range.currentNumber < range.startNumber || range.currentNumber > range.endNumber) {
        results.push(
          buildResult({
            ruleCode: "IDENTIFIER_CURRENT_IN_RANGE",
            category: CATEGORY,
            status: "FAIL",
            ...anomaly,
            title: "Identifier counter is out of range",
            message: `Range ${rangeLabel} current number ${range.currentNumber} is outside ${range.startNumber}-${range.endNumber}.`,
            affectedEntityType: "IdentifierRange",
            affectedEntityId: range.id,
            remediation: "Reset the counter to a value inside the configured range.",
          })
        );
      } else if (isActive && range.currentNumber >= range.endNumber) {
        results.push(
          buildResult({
            ruleCode: "IDENTIFIER_CURRENT_IN_RANGE",
            category: CATEGORY,
            status: "WARNING",
            ...WARN_LOW,
            title: "Identifier range is nearly exhausted",
            message: `Range ${rangeLabel} has reached its configured end (${range.currentNumber}/${range.endNumber}).`,
            affectedEntityType: "IdentifierRange",
            affectedEntityId: range.id,
            remediation: "Prepare an additional identifier range before the current one is consumed.",
          })
        );
      }
    }

    if (results.length === 0) {
      const primary = active[0];
      results.push(
        buildResult({
          ruleCode: "IDENTIFIER_RANGE_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "Identifier range is valid",
          message: `Range ${primary?.prefix ?? ""} is active and within bounds.`,
        })
      );
    }

    return results;
  },
};