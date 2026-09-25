import type {
  ReadinessRuleResult,
  ResultSeverity,
  ResultStatus,
} from "../types";
import { ruleResult } from "../types";

/**
 * Shared policy for rule severities.
 *
 * - CRITICAL + blocking  → drives the overall status to BLOCKED (fail-safe).
 *   Reserved for safety/integrity conflicts: inactive or maintenance stations,
 *   conflicting configuration, expired assignments, corrupt references,
 *   overlapping identifier ranges.
 * - HIGH + blocking      → drives the overall status to NOT_READY.
 *   Reserved for ordinary missing configuration: inactive BOM, missing WI,
 *   missing operator, missing inventory mapping, and similar.
 * - WARNING (LOW/MEDIUM) → informational, non-blocking.
 */
export const CRITICAL_BLOCK = { severity: "CRITICAL" as ResultSeverity, isBlocking: true };
export const HIGH_BLOCK = { severity: "HIGH" as ResultSeverity, isBlocking: true };
export const MEDIUM_BLOCK = { severity: "MEDIUM" as ResultSeverity, isBlocking: true };
export const WARN_LOW = { severity: "LOW" as ResultSeverity, isBlocking: false };
export const WARN_MEDIUM = { severity: "MEDIUM" as ResultSeverity, isBlocking: false };
export const PASS_INFO = { severity: "INFO" as ResultSeverity, isBlocking: false };

export interface BuildResultInput {
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
}

/** Convenience wrapper keeping rule results consistent across all rules. */
export function buildResult(input: BuildResultInput): ReadinessRuleResult {
  return ruleResult(input);
}

/** Trim a value and return true when it is empty/whitespace. */
export function isEmptyText(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

/** True when the assignment window contains the reference time (inclusive). */
export function windowContains(
  validFrom: Date,
  validTo: Date,
  asOf: Date
): boolean {
  const time = asOf.getTime();
  return validFrom.getTime() <= time && validTo.getTime() >= time;
}