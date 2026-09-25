/**
 * Infrastructure error classification.
 *
 * The readiness checker's contract is fail-safe: if the platform cannot reach
 * or trust its database, it must never report success, and it must never leak
 * connection strings, SQL, or stack traces to the caller. A raw driver failure
 * bubbling out of a route handler used to become an opaque
 * `500 INTERNAL_ERROR`, which is indistinguishable between "no DATABASE_URL",
 * "TLS handshake failed", and "migrations were never applied".
 *
 * This module maps those failures onto a small, stable set of codes. The
 * *reason* is for operator logs only; the *message* is fixed per code and is
 * safe to return to a client.
 */
import { ApiError } from "@/lib/errors";
import {
  DATABASE_CONFIGURATION_ERROR,
  DatabaseConfigurationError,
} from "@/lib/db/config";
import { AUTH_CONFIGURATION_ERROR, AuthConfigurationError } from "@/lib/auth/config";

export const INFRASTRUCTURE_CODES = {
  /** DATABASE_URL is absent, malformed, or rejected by the config validator. */
  DATABASE_NOT_CONFIGURED: "DATABASE_NOT_CONFIGURED",
  /** The database exists but cannot be reached, or the pool is exhausted. */
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  /** The database rejected our credentials. */
  DATABASE_AUTHENTICATION_FAILED: "DATABASE_AUTHENTICATION_FAILED",
  /** Reachable, but the schema is missing or out of date. */
  DATABASE_SCHEMA_NOT_READY: "DATABASE_SCHEMA_NOT_READY",
  /** AUTH_SECRET is absent, so password verification cannot be performed. */
  AUTH_NOT_CONFIGURED: "AUTH_NOT_CONFIGURED",
} as const;

export type InfrastructureCode =
  (typeof INFRASTRUCTURE_CODES)[keyof typeof INFRASTRUCTURE_CODES];

export interface InfrastructureError {
  /** Stable API error code. Safe to return to clients and to branch on. */
  readonly code: InfrastructureCode;
  /**
   * Stable machine-readable cause, derived from the driver's own code. Safe to
   * log: it is a fixed token, never driver free text.
   */
  readonly reason: string;
  /** Fixed, operator-actionable text for the same code. Safe to return. */
  readonly message: string;
}

const MESSAGES: Record<InfrastructureCode, string> = {
  DATABASE_NOT_CONFIGURED:
    "The service database is not configured. This deployment cannot serve requests.",
  DATABASE_UNAVAILABLE:
    "The service database is unavailable. Please retry in a moment.",
  DATABASE_AUTHENTICATION_FAILED:
    "The service database rejected its credentials. This deployment cannot serve requests.",
  DATABASE_SCHEMA_NOT_READY:
    "The service database schema is not initialized. This deployment cannot serve requests.",
  AUTH_NOT_CONFIGURED:
    "Authentication is not configured on this deployment. This deployment cannot serve requests.",
};

/** Prisma Client error codes (P####) grouped by what an operator must do. */
const PRISMA_AUTHENTICATION_CODES = new Set(["P1000", "P1010"]);

const PRISMA_UNAVAILABLE_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1003", // Database does not exist on the server
  "P1008", // Operation timed out
  "P1011", // TLS connection error
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a new connection from the pool
]);

const PRISMA_SCHEMA_CODES = new Set([
  "P2021", // The table does not exist in the database
  "P2022", // The column does not exist in the database
]);

/**
 * libuv / Node socket-level failures surfaced by `pg` when a remote host is
 * unreachable, refuses the connection, or drops it mid-handshake.
 */
const SOCKET_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "EPROTO",
  "EAI_AGAIN",
  "ETIMEDOUT",
]);

/** Maximum `cause` chain depth walked before giving up. */
const MAX_CAUSE_DEPTH = 5;

interface DriverErrorShape {
  code?: unknown;
  name?: unknown;
  message?: unknown;
  cause?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function infrastructure(code: InfrastructureCode, reason: string): InfrastructureError {
  return { code, reason, message: MESSAGES[code] };
}

/**
 * Classify a single error in a `cause` chain, or return null when the error is
 * not a recognised infrastructure fault.
 */
function classifySingle(error: unknown): InfrastructureError | null {
  if (error instanceof DatabaseConfigurationError) {
    return infrastructure(INFRASTRUCTURE_CODES.DATABASE_NOT_CONFIGURED, DATABASE_CONFIGURATION_ERROR);
  }
  if (error instanceof AuthConfigurationError) {
    return infrastructure(INFRASTRUCTURE_CODES.AUTH_NOT_CONFIGURED, AUTH_CONFIGURATION_ERROR);
  }
  if (error instanceof ApiError) {
    return null; // Deliberate, already-safe application errors are not infra faults.
  }
  if (!isRecord(error)) return null;

  const shape = error as DriverErrorShape;
  const code = stringField(shape.code);
  const name = stringField(shape.name);

  // Own configuration guards, matched by their stable code so the check also
  // works across a duplicated module instance (e.g. after a hot reload).
  if (code === DATABASE_CONFIGURATION_ERROR) {
    return infrastructure(INFRASTRUCTURE_CODES.DATABASE_NOT_CONFIGURED, code);
  }
  if (code === AUTH_CONFIGURATION_ERROR) {
    return infrastructure(INFRASTRUCTURE_CODES.AUTH_NOT_CONFIGURED, code);
  }

  if (name === "PrismaClientInitializationError") {
    return infrastructure(INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE, name);
  }

  if (code) {
    if (PRISMA_AUTHENTICATION_CODES.has(code)) {
      return infrastructure(INFRASTRUCTURE_CODES.DATABASE_AUTHENTICATION_FAILED, code);
    }
    if (PRISMA_UNAVAILABLE_CODES.has(code)) {
      return infrastructure(INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE, code);
    }
    if (PRISMA_SCHEMA_CODES.has(code)) {
      return infrastructure(INFRASTRUCTURE_CODES.DATABASE_SCHEMA_NOT_READY, code);
    }
    if (SOCKET_ERROR_CODES.has(code)) {
      return infrastructure(INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE, code);
    }
    // PostgreSQL SQLSTATE: 08xxx connection exception, 53xxx insufficient
    // resources, 57P0x operator intervention (shutdown / cannot connect now).
    if (/^(08|53\d\d|57P0\d)/.test(code)) {
      return infrastructure(INFRASTRUCTURE_CODES.DATABASE_UNAVAILABLE, code);
    }
    // Class 28 is "invalid authorization specification" (28P01 invalid_password,
    // 28000 invalid_authorization_specification). A SQLSTATE is a 2-character
    // class plus a 3-character subclass, so the tail is alphanumeric.
    if (/^28[A-Z0-9]{3}$/i.test(code)) {
      return infrastructure(INFRASTRUCTURE_CODES.DATABASE_AUTHENTICATION_FAILED, code);
    }
    // 42P01 undefined_table, 42703 undefined_column, 3D000/3F000
    // invalid_catalog_name (database or schema missing).
    if (/^(42P01|42703|3[DF]000)$/.test(code)) {
      return infrastructure(INFRASTRUCTURE_CODES.DATABASE_SCHEMA_NOT_READY, code);
    }
  }

  return null;
}

/**
 * Classify an unknown thrown value as an infrastructure fault, or null when it
 * is an ordinary application error that should keep its existing handling.
 *
 * The `cause` chain is walked because Prisma's driver adapters wrap the
 * underlying `pg` error, and the useful code is on the innermost error.
 */
export function classifyInfrastructureError(error: unknown): InfrastructureError | null {
  let current: unknown = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    const classified = classifySingle(current);
    if (classified) return classified;
    if (!isRecord(current)) return null;
    const next: unknown = (current as DriverErrorShape).cause;
    if (next === undefined || next === null) return null;
    current = next;
  }

  return null;
}

/** Convert an infrastructure fault into a safe 503, or null if it is not one. */
export function toInfrastructureApiError(error: unknown): ApiError | null {
  const classified = classifyInfrastructureError(error);
  if (!classified) return null;
  return ApiError.serviceUnavailable(classified.code, classified.message);
}
