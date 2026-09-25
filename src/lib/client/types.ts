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

export interface BomDetail extends BomListItem {
  items: Array<{
    id: string;
    componentSku: string;
    componentName: string;
    quantity: number;
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

export interface RoutingDetail extends RoutingListItem {
  operations: Array<{
    id: string;
    sequence: number;
    operationCode: string;
    operationName: string;
    standardCycleTimeSeconds: number | null;
    required: boolean;
    stationId: string | null;
    station: { id: string; code: string; name: string; status: string } | null;
  }>;
  product: { id: string; sku: string; name: string };
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