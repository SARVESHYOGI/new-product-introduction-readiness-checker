import type {
  CategoryStatus,
  ReadinessOutcome,
  ReadinessRuleResult,
  ReadinessStatus,
  ReadinessSummary,
  RootBlocker,
} from "./types";
import { READINESS_CATEGORIES } from "./types";

/**
 * Readiness scoring.
 *
 * Scoring is visibility only — it never overrides blocking rules. The overall
 * status is derived deterministically:
 *
 *   CRITICAL blocking failure present  → BLOCKED
 *   any blocking failure present       → NOT_READY
 *   otherwise                          → READY
 *
 * A high percentage can never turn a BLOCKED/NOT_READY result into READY.
 */
export function computeCategoryStatuses(
  checks: ReadinessRuleResult[]
): Record<string, CategoryStatus> {
  const byCategory = new Map<string, ReadinessRuleResult[]>();
  for (const check of checks) {
    const list = byCategory.get(check.category) ?? [];
    list.push(check);
    byCategory.set(check.category, list);
  }

  const statuses: Record<string, CategoryStatus> = {};
  for (const category of READINESS_CATEGORIES) {
    const results = byCategory.get(category) ?? [];
    if (results.length === 0) {
      statuses[category] = "UNVERIFIED";
    } else if (results.some((r) => r.status === "FAIL")) {
      statuses[category] = "FAIL";
    } else if (results.some((r) => r.status === "WARNING")) {
      statuses[category] = "WARNING";
    } else {
      statuses[category] = "PASS";
    }
  }
  return statuses;
}

export function summarize(
  categoryStatuses: Record<string, CategoryStatus>,
  checks: ReadinessRuleResult[]
): ReadinessSummary {
  const values = Object.values(categoryStatuses);
  const passed = values.filter((s) => s === "PASS").length;
  const warnings = values.filter((s) => s === "WARNING").length;
  const failed = values.filter((s) => s === "FAIL").length;
  const blocking = checks.filter((c) => c.status === "FAIL" && c.isBlocking).length;

  return {
    total: READINESS_CATEGORIES.length,
    passed,
    warnings,
    failed,
    blocking,
  };
}

export function overallStatus(checks: ReadinessRuleResult[]): ReadinessStatus {
  const failures = checks.filter((c) => c.status === "FAIL");
  if (failures.some((c) => c.severity === "CRITICAL")) return "BLOCKED";
  if (failures.length > 0) return "NOT_READY";
  return "READY";
}

export function buildOutcome(
  checks: ReadinessRuleResult[],
  rootBlockers: RootBlocker[]
): ReadinessOutcome {
  const categoryStatuses = computeCategoryStatuses(checks);
  const summary = summarize(categoryStatuses, checks);
  const score = Math.round(
    (summary.passed / READINESS_CATEGORIES.length) * 100
  );

  return {
    status: overallStatus(checks),
    score,
    summary,
    checks,
    rootBlockers,
    categoryStatuses,
  };
}