import type {
  BOMItem,
  BOMVersion,
  IdentifierRange,
  InventoryItem,
  Line,
  Operator,
  OperatorStationAssignment,
  Product,
  ProductInventoryMapping,
  Routing,
  RoutingOperation,
  Station,
  WorkInstruction,
} from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Rule result contract (standardized across every rule)
// ---------------------------------------------------------------------------

export type ResultStatus = "PASS" | "WARNING" | "FAIL";
export type ResultSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ReadinessRuleResult {
  ruleCode: string;
  category: string;
  status: ResultStatus;
  severity: ResultSeverity;
  title: string;
  message: string;
  affectedEntityType?: string | null;
  affectedEntityId?: string | null;
  remediation?: string | null;
  isBlocking: boolean;
  /** Set by the dependency analyzer when this failure is a consequence of another. */
  causeRuleCode?: string | null;
}

export interface ReadinessRule {
  /** Stable rule prefix, e.g. "BOM". */
  code: string;
  /** Display category, e.g. "BOM". */
  category: string;
  evaluate(context: ReadinessContext): Promise<ReadinessRuleResult[]>;
}

// ---------------------------------------------------------------------------
// Readiness context — everything a rule needs, loaded once, efficiently
// ---------------------------------------------------------------------------

export interface ReadinessCheckInput {
  productId: string;
  bomVersionId: string;
  routingId: string;
  lineId: string;
}

export type RoutingOperationWithStation = RoutingOperation & {
  station: StationWithLine | null;
};

export type StationWithLine = Station & { line: Line | null };

export type BomWithItems = BOMVersion & { items: BOMItem[] };

export type RoutingWithOperations = Routing & {
  operations: RoutingOperationWithStation[];
};

export type LineWithStations = Line & { stations: Station[] };

export type InventoryMappingWithItem = ProductInventoryMapping & {
  inventoryItem: InventoryItem | null;
};

export type AssignmentWithOperator = OperatorStationAssignment & {
  operator: Operator | null;
};

export interface ReadinessContext {
  input: ReadinessCheckInput;
  /** The "current time" — injectable so rules are deterministically testable. */
  asOf: Date;
  product: Product | null;
  bomVersion: BomWithItems | null;
  routing: RoutingWithOperations | null;
  line: LineWithStations | null;
  stationsById: Map<string, StationWithLine>;
  identifierRanges: IdentifierRange[];
  inventoryMappings: InventoryMappingWithItem[];
  operatorAssignments: AssignmentWithOperator[];
  operatorsById: Map<string, Operator>;
  /** All BOM versions for the selected product (for duplicate-active safety). */
  productBoms: Pick<BOMVersion, "id" | "version" | "status">[];
  /** All routings for the selected product (for duplicate-active safety). */
  productRoutings: Pick<Routing, "id" | "code" | "status">[];
  /** Work instructions indexed by routing operation id. */
  workInstructionsByOperation: Map<string, WorkInstruction[]>;
}

/**
 * Loads the full context for a readiness check with batched, indexed queries.
 * The engine only depends on this interface, so rules can be unit-tested with
 * an in-memory loader.
 */
export interface ReadinessContextLoader {
  load(input: ReadinessCheckInput, asOf: Date): Promise<ReadinessContext>;
}

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

export type ReadinessStatus = "READY" | "NOT_READY" | "BLOCKED" | "ERROR";

export interface ReadinessSummary {
  total: number;
  passed: number;
  warnings: number;
  failed: number;
  blocking: number;
}

export interface RootBlocker {
  ruleCode: string;
  category: string;
  severity: ResultSeverity;
  title: string;
  message: string;
  remediation?: string | null;
  affectedEntityType?: string | null;
  affectedEntityId?: string | null;
  /** Categories that fail as a direct consequence of this root blocker. */
  impacts: string[];
}

export type CategoryStatus = "PASS" | "WARNING" | "FAIL" | "UNVERIFIED";

export interface ReadinessOutcome {
  status: ReadinessStatus;
  score: number;
  summary: ReadinessSummary;
  checks: ReadinessRuleResult[];
  rootBlockers: RootBlocker[];
  categoryStatuses: Record<string, CategoryStatus>;
}

export const READINESS_CATEGORIES = [
  "BOM",
  "Routing",
  "Work Instructions",
  "Identifier Range",
  "Inventory Mapping",
  "Operators",
  "Stations",
] as const;

export interface RuleResultInput {
  ruleCode: string;
  category: string;
  status: ResultStatus;
  severity: ResultSeverity;
  title: string;
  message: string;
  affectedEntityType?: string;
  affectedEntityId?: string;
  remediation?: string;
  isBlocking: boolean;
  causeRuleCode?: string;
}

export function ruleResult(input: RuleResultInput): ReadinessRuleResult {
  return { ...input };
}

/** Helper: copy source entity references for work instructions attached to ops. */
export type OperationWorkInstructions = {
  workInstructions: WorkInstruction[];
};