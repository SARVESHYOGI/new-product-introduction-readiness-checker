import type { ReadinessRuleResult } from "./types";
import { computeCategoryStatuses, summarize } from "./scoring";
import { deriveRootBlockers } from "./dependency-analyzer";
import { READINESS_CATEGORIES } from "./types";
import type { CheckWithResults } from "./service";

export interface SerializedCheck {
  id: string;
  productId: string;
  bomVersionId: string;
  routingId: string;
  lineId: string;
  status: string;
  score: number;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    blocking: number;
  };
  categoryStatuses: Record<string, string>;
  checks: ReadinessRuleResult[];
  rootBlockers: ReturnType<typeof deriveRootBlockers>;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  product?: { id: string; sku: string; name: string } | null;
  bomVersion?: { id: string; version: string } | null;
  routing?: { id: string; code: string } | null;
  line?: { id: string; code: string; name: string } | null;
}

export type CheckWithReferences = CheckWithResults;

/**
 * Convert a persisted (immutable) readiness check into the API response shape.
 * Root blockers and category statuses are re-derived deterministically from the
 * stored results — history is never rewritten.
 */
export function serializeCheck(check: CheckWithReferences): SerializedCheck {
  const checks: ReadinessRuleResult[] = check.results.map((r) => ({
    ruleCode: r.ruleCode,
    category: r.category,
    status: r.status,
    severity: r.severity,
    title: r.title,
    message: r.message,
    affectedEntityType: r.affectedEntityType,
    affectedEntityId: r.affectedEntityId,
    causeRuleCode: r.causeRuleCode,
    remediation: r.remediation,
    isBlocking: r.isBlocking,
  }));

  const categoryStatuses = computeCategoryStatuses(checks);
  const rootBlockers = deriveRootBlockers(checks);
  const summary = summarize(categoryStatuses, checks);

  return {
    id: check.id,
    productId: check.productId,
    bomVersionId: check.bomVersionId,
    routingId: check.routingId,
    lineId: check.lineId,
    status: check.status,
    score: check.score,
    summary,
    categoryStatuses,
    checks,
    rootBlockers,
    startedAt: check.startedAt.toISOString(),
    completedAt: check.completedAt.toISOString(),
    createdAt: check.createdAt.toISOString(),
    product: check.product,
    bomVersion: check.bomVersion,
    routing: check.routing,
    line: check.line,
  };
}

export { READINESS_CATEGORIES };