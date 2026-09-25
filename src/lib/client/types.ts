/**
 * Client-side types mirroring the API response shapes.
 * Keep these in sync with src/modules/readiness/serialization.ts and the
 * service layer DTOs.
 */

export type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
export type LineStatus = "ACTIVE" | "INACTIVE";
export type UserRole = "ADMIN" | "ENGINEER" | "VIEWER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/** Configuration pieces a product needs before a check can be requested. */
export type ConfigurationGap = "BOM" | "ROUTING";

export interface ProductConfiguration {
  hasBom: boolean;
  hasRouting: boolean;
  /** A product can exist in the catalog and still be unconfigured. */
  isConfigured: boolean;
  missing: ConfigurationGap[];
}

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  _count: { bomVersions: number; routings: number; readinessChecks: number };
  configuration: ProductConfiguration;
  lastCheckStatus: ReadinessStatus | null;
  lastCheckScore: number | null;
}

export interface BomListItem {
  id: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "OBSOLETE";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  itemCount: number;
}

export interface BomDetail {
  id: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "OBSOLETE";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    componentSku: string;
    componentName: string;
    quantity: string | number;
    unit: string;
    isRequired: boolean;
  }>;
  product: { id: string; sku: string; name: string };
}

export interface RoutingListItem {
  id: string;
  code: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "OBSOLETE";
  createdAt: string;
  operationCount: number;
}

export interface RoutingDetail {
  id: string;
  code: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "OBSOLETE";
  createdAt: string;
  updatedAt: string;
  operations: Array<{
    id: string;
    sequence: number;
    operationCode: string;
    operationName: string;
    standardCycleTimeSeconds: number | null;
    required: boolean;
    stationId: string | null;
    station: {
      id: string;
      code: string;
      name: string;
      status: StationStatus;
      /** Needed to warn when a station belongs to a different production line. */
      lineId: string | null;
    } | null;
    /** All versions for the operation, newest first — the editor shows the history. */
    workInstructions: WorkInstructionSummary[];
  }>;
  product: { id: string; sku: string; name: string };
}

export interface WorkInstructionSummary {
  id: string;
  title: string;
  version: number;
  status: VersionStatus;
  required: boolean;
}

export interface LineListItem {
  id: string;
  code: string;
  name: string;
  status: LineStatus;
  stationCount: number;
}

export interface DashboardStats {
  productCount: number;
  activeLineCount: number;
  readyProductCount: number;
  blockedProductCount: number;
  notReadyProductCount: number;
  checkCount: number;
  recentChecks: Array<{
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    status: string;
    score: number;
    createdAt: string;
  }>;
}

// ---------------------------------------------------------------- readiness

export type ResultStatus = "PASS" | "WARNING" | "FAIL";
export type ResultSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ReadinessStatus = "READY" | "NOT_READY" | "BLOCKED" | "ERROR";
export type CategoryStatus = "PASS" | "WARNING" | "FAIL" | "UNVERIFIED";

export interface CheckResult {
  ruleCode: string;
  category: string;
  status: ResultStatus;
  severity: ResultSeverity;
  title: string;
  message: string;
  affectedEntityType?: string | null;
  affectedEntityId?: string | null;
  causeRuleCode?: string | null;
  remediation?: string | null;
  isBlocking: boolean;
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
  impacts: string[];
}

export interface SerializedCheck {
  id: string;
  productId: string;
  bomVersionId: string;
  routingId: string;
  lineId: string;
  status: ReadinessStatus;
  score: number;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    blocking: number;
  };
  categoryStatuses: Record<string, CategoryStatus>;
  checks: CheckResult[];
  rootBlockers: RootBlocker[];
  startedAt: string;
  completedAt: string;
  createdAt: string;
  /** Enriched server-side in the API responses where available. */
  product?: { id: string; sku: string; name: string } | null;
  bomVersion?: { id: string; version: string } | null;
  routing?: { id: string; code: string } | null;
  line?: { id: string; code: string; name: string } | null;
}

export interface ReadinessCheckInput {
  productId: string;
  bomVersionId: string;
  routingId: string;
  lineId: string;
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

// ------------------------------------------------------ configuration editor

/**
 * Advisory conflicts returned by configuration writes.
 *
 * These are NOT readiness decisions. The deterministic engine remains the only
 * authority on whether a configuration is safe; the editor merely tells the
 * engineer "this edit is very likely to produce a blocking failure" so they are
 * not surprised by the next check.
 */
export interface AdvisoryConflict {
  code: string;
  message: string;
}

export type VersionStatus = "DRAFT" | "ACTIVE" | "OBSOLETE";
export type StationStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";
export type OperatorStatus = "ACTIVE" | "INACTIVE";
export type AssignmentStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export type InventoryStatus = "ACTIVE" | "INACTIVE";
export type RangeStatus = "ACTIVE" | "INACTIVE" | "EXHAUSTED";

export interface BomItem {
  id: string;
  componentSku: string;
  componentName: string;
  quantity: string | number;
  unit: string;
  isRequired: boolean;
}

export interface BomItemInput {
  componentSku: string;
  componentName: string;
  quantity: string;
  unit: string;
  isRequired: boolean;
}

export interface StationListItem {
  id: string;
  code: string;
  name: string;
  status: StationStatus;
  lineId: string | null;
  capabilities: string[];
  line: { id: string; code: string; name: string } | null;
  operatorCount: number;
}

export interface OperatorAssignment {
  id: string;
  stationId: string;
  stationCode: string;
  stationName: string;
  validFrom: string;
  validTo: string;
  status: AssignmentStatus;
}

export interface OperatorListItem {
  id: string;
  employeeCode: string;
  name: string;
  status: OperatorStatus;
  assignments: OperatorAssignment[];
  /** ACTIVE assignments whose validity window covers now. */
  activeAssignmentCount: number;
}

export interface WorkInstructionListItem {
  id: string;
  routingOperationId: string;
  title: string;
  content: string;
  version: number;
  status: VersionStatus;
  required: boolean;
  routingOperation: {
    id: string;
    sequence: number;
    operationCode: string;
    operationName: string;
    required: boolean;
    routingId: string;
    routingCode: string;
    productId: string;
    productName: string;
  };
}

export interface InventoryItemListItem {
  id: string;
  sku: string;
  name: string;
  status: InventoryStatus;
  productMappings: Array<{
    id: string;
    productId: string;
    status: InventoryStatus;
    product: { id: string; sku: string; name: string };
  }>;
}

export interface IdentifierRangeListItem {
  id: string;
  productId: string;
  prefix: string;
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  status: RangeStatus;
}

export interface ProductInventoryConfig {
  mappings: Array<{
    id: string;
    productId: string;
    inventoryItemId: string;
    mappingType: "OUTPUT";
    status: InventoryStatus;
    inventoryItem: { id: string; sku: string; name: string; status: InventoryStatus };
  }>;
  ranges: IdentifierRangeListItem[];
}

/** Write payloads. Decimal quantities travel as strings to avoid float drift. */
export interface ProductUpdateInput {
  name?: string;
  description?: string | null;
  status?: ProductStatus;
}

export interface BomVersionCreateInput {
  version: string;
  status?: VersionStatus;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface RoutingCreateInput {
  code: string;
  version: string;
  status?: VersionStatus;
}

export interface RoutingOperationInput {
  sequence: number;
  operationCode: string;
  operationName: string;
  standardCycleTimeSeconds?: number | null;
  required: boolean;
  stationId?: string | null;
}

export interface LineInput {
  code?: string;
  name: string;
  status: LineStatus;
}

export interface StationInput {
  code?: string;
  name: string;
  status: StationStatus;
  lineId: string | null;
  capabilities: string[];
}

export interface OperatorInput {
  employeeCode?: string;
  name: string;
  status: OperatorStatus;
}

/**
 * A new assignment window. `validTo` is inclusive: a date-only value such as
 * "2027-01-31" is widened to the end of that day by the server.
 */
export interface AssignmentCreateInput {
  stationId: string;
  validFrom: string;
  validTo: string;
}

/** Revoke or re-date an existing window. EXPIRED is derived, never stored. */
export interface AssignmentUpdateInput {
  validFrom?: string;
  validTo?: string;
  status?: Extract<AssignmentStatus, "ACTIVE" | "REVOKED">;
}

export interface WorkInstructionInput {
  title: string;
  content: string;
  status?: VersionStatus;
  required: boolean;
}

export interface InventoryItemInput {
  sku?: string;
  name: string;
  status: InventoryStatus;
}

export interface IdentifierRangeCreateInput {
  prefix: string;
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  status: RangeStatus;
}

/**
 * Partial range edit. `currentNumber` may only move forward: lowering it would
 * re-issue serials that have already left the plant, which the server rejects.
 */
export type IdentifierRangeUpdateInput = Partial<IdentifierRangeCreateInput>;