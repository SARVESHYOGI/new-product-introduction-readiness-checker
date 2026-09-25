import type {
  ReadinessOutcome,
  ReadinessRuleResult,
  RootBlocker,
} from "./types";

/**
 * Deterministic remediation assistant.
 *
 * Builds an ordered action plan from blocker results only. It never makes a
 * safety decision — the engine's status/score are the source of truth. When an
 * LLM is unavailable, this module still produces human-readable explanations
 * from templates, so the application works fully without a key.
 */

export interface RemediationStep {
  order: number;
  action: string;
  detail: string;
  ruleCode: string;
  category: string;
  affectedEntityType?: string | null;
  affectedEntityId?: string | null;
  isRoot: boolean;
}

const CATEGORY_ORDER = [
  "BOM",
  "Routing",
  "Stations",
  "Work Instructions",
  "Operators",
  "Identifier Range",
  "Inventory Mapping",
];

function categoryRank(category: string): number {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function resultKey(r: {
  ruleCode: string;
  affectedEntityId?: string | null;
}): string {
  return r.affectedEntityId ? `${r.ruleCode}:${r.affectedEntityId}` : r.ruleCode;
}

export function buildRemediationPlan(outcome: ReadinessOutcome): RemediationStep[] {
  const failures = outcome.checks.filter((c) => c.status === "FAIL");
  const rootKeys = new Set(outcome.rootBlockers.map((r) => resultKey(r)));

  const steps: RemediationStep[] = [];
  let order = 0;

  const addStep = (
    f: ReadinessRuleResult | RootBlocker,
    isRoot: boolean
  ) => {
    order += 1;
    steps.push({
      order,
      action: f.remediation ?? `Resolve: ${f.title}`,
      detail: f.message,
      ruleCode: f.ruleCode,
      category: f.category,
      affectedEntityType: f.affectedEntityType,
      affectedEntityId: f.affectedEntityId,
      isRoot,
    });
  };

  // Roots first, ordered by dependency depth (BOM → … → Inventory).
  const orderedRoots = [...outcome.rootBlockers].sort(
    (a, b) => categoryRank(a.category) - categoryRank(b.category)
  );
  for (const root of orderedRoots) addStep(root, true);

  // Consequences (failures explained by a root) come after their root so the
  // plan reads as: fix the root, then the knock-on effects are resolved.
  const consequences = failures
    .filter((f) => !rootKeys.has(resultKey(f)))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
  for (const f of consequences) addStep(f, false);

  return steps;
}

/**
 * Plain-language explanation of the blockers, assembled from deterministic
 * templates. This is NOT an LLM judgement and never alters the outcome.
 */
export function explainBlockers(outcome: ReadinessOutcome): string[] {
  const lines: string[] = [];

  if (outcome.rootBlockers.length === 0) {
    lines.push(
      outcome.status === "READY"
        ? "All production readiness checks passed."
        : "Readiness could not be verified. No further automated explanation is available."
    );
    return lines;
  }

  const count = outcome.rootBlockers.length;
  lines.push(
    count === 1
      ? "There is 1 root blocker preventing production."
      : `There are ${count} root blockers preventing production.`
  );

  for (const root of outcome.rootBlockers) {
    const entity =
      root.affectedEntityType && root.affectedEntityId
        ? `${root.affectedEntityType} ${root.affectedEntityId}`
        : root.category.toLowerCase();
    lines.push(
      `- ${root.title}. ${root.message} This involves ${entity}.`
    );
    if (root.impacts.length > 0) {
      lines.push(
        `  Knock-on effect: ${root.impacts.join(", ")} cannot be verified until this is fixed.`
      );
    }
    if (root.remediation) {
      lines.push(`  Recommended action: ${root.remediation}`);
    }
  }

  return lines;
}