import type {
  ReadinessRuleResult,
  RootBlocker,
} from "./types";

/**
 * Deterministic root-cause analysis.
 *
 * The engine produces per-rule results; many failures are consequences of a
 * more fundamental problem (e.g. an inactive station explains why operators
 * cannot be assigned and why the routing step is invalid). This analyzer
 * collapses those duplicate, related blockers into a single root blocker and
 * lists the categories it impacts — without ever inventing causes.
 *
 * Cause tracking: each result can reference the result that explains it via
 * `causeRuleCode`. Because a rule code may repeat across entities, the stored
 * reference is a unique result key: `ruleCode[:affectedEntityId]`.
 */

export function resultKey(r: {
  ruleCode: string;
  affectedEntityId?: string | null;
}): string {
  return r.affectedEntityId ? `${r.ruleCode}:${r.affectedEntityId}` : r.ruleCode;
}

function stationIdOf(r: ReadinessRuleResult): string | undefined {
  return r.affectedEntityType === "Station" && r.affectedEntityId
    ? r.affectedEntityId
    : undefined;
}

/**
 * Mark consequence failures with a cause, and return the mutated copies.
 *
 * @param opStation mapping from routing operation id → station id, used to
 *                  connect work-instruction failures to their station problem.
 */
export function analyzeResults(
  results: ReadinessRuleResult[],
  opStation: Map<string, string>
): ReadinessRuleResult[] {
  const checks = results.map((r) => ({ ...r }));

  const stationFailures = new Map<string, ReadinessRuleResult[]>();
  const routingFailuresByStation = new Map<string, ReadinessRuleResult[]>();
  const routingFailuresByOp = new Map<string, ReadinessRuleResult[]>();

  for (const f of checks) {
    if (f.status !== "FAIL") continue;
    const sid = stationIdOf(f);
    if (!sid) continue;
    if (f.category === "Stations") {
      push(stationFailures, sid, f);
    } else if (f.category === "Routing") {
      push(routingFailuresByStation, sid, f);
    }
  }
  for (const f of checks) {
    if (f.status !== "FAIL" || f.causeRuleCode) continue;
    if (f.category === "Routing" && f.affectedEntityType === "RoutingOperation") {
      push(routingFailuresByOp, f.affectedEntityId!, f);
    }
  }

  for (const f of checks) {
    if (f.status !== "FAIL" || f.causeRuleCode) continue;
    const cause = findCause(f, {
      stationFailures,
      routingFailuresByStation,
      routingFailuresByOp,
      opStation,
    });
    if (cause) f.causeRuleCode = resultKey(cause);
  }

  return checks;
}

interface CauseIndex {
  stationFailures: Map<string, ReadinessRuleResult[]>;
  routingFailuresByStation: Map<string, ReadinessRuleResult[]>;
  routingFailuresByOp: Map<string, ReadinessRuleResult[]>;
  opStation: Map<string, string>;
}

function findCause(
  f: ReadinessRuleResult,
  index: CauseIndex
): ReadinessRuleResult | undefined {
  const sid = stationIdOf(f);

  if (f.category === "Operators") {
    if (!sid) return undefined;
    return (
      index.stationFailures.get(sid)?.[0] ??
      index.routingFailuresByStation.get(sid)?.[0]
    );
  }

  if (f.category === "Work Instructions") {
    const opId =
      f.affectedEntityType === "RoutingOperation" ? f.affectedEntityId : undefined;
    if (opId) {
      const opCause = index.routingFailuresByOp.get(opId);
      if (opCause) return opCause[0];
      const opSid = index.opStation.get(opId);
      if (opSid) {
        return (
          index.stationFailures.get(opSid)?.[0] ??
          index.routingFailuresByStation.get(opSid)?.[0]
        );
      }
    }
    // Fall back to the station the operation uses (when the operation id lookup
    // was inconclusive).
    if (sid) {
      return (
        index.stationFailures.get(sid)?.[0] ??
        index.routingFailuresByStation.get(sid)?.[0]
      );
    }
    return undefined;
  }

  if (f.category === "Routing" && sid) {
    // A routing rule that flags a station problem is a consequence of the
    // Station-category failure for the same station when one exists.
    return index.stationFailures.get(sid)?.[0];
  }

  return undefined;
}

function push(map: Map<string, ReadinessRuleResult[]>, key: string, value: ReadinessRuleResult): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/**
 * Rebuild root blockers from results that already carry `causeRuleCode`
 * (either freshly analyzed or loaded from the database).
 * Root blockers are FAIL results with no cause; impacts are the distinct
 * categories of every result transitively caused by that root.
 */
export function deriveRootBlockers(results: ReadinessRuleResult[]): RootBlocker[] {
  const failures = results.filter((r) => r.status === "FAIL");
  const roots = failures.filter((r) => !r.causeRuleCode);

  return roots.map((root) => {
    const rootKey = resultKey(root);
    const tree = collectTree(rootKey, failures);
    const impacts = new Set<string>();
    for (const f of failures) {
      if (tree.has(resultKey(f)) && resultKey(f) !== rootKey) {
        if (f.category !== root.category) impacts.add(f.category);
      }
    }
    return {
      ruleCode: root.ruleCode,
      category: root.category,
      severity: root.severity,
      title: root.title,
      message: root.message,
      remediation: root.remediation,
      affectedEntityType: root.affectedEntityType,
      affectedEntityId: root.affectedEntityId,
      impacts: [...impacts],
    };
  });
}

/** BFS over the cause chain starting from rootKey (inclusive). */
function collectTree(
  rootKey: string,
  all: ReadinessRuleResult[]
): Set<string> {
  const byKey = new Map(all.map((r) => [resultKey(r), r]));
  const visited = new Set<string>();
  const queue = [rootKey];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const node = byKey.get(key);
    if (!node) continue;
    for (const f of all) {
      if (f.causeRuleCode === key) queue.push(resultKey(f));
    }
  }
  return visited;
}