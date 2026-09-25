import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  event: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLevel];
}

/**
 * Structured JSON logger.
 *
 * Never logs secrets: callers must not pass passwords, tokens, or connection
 * strings as fields. A small allowlist is enforced for known-sensitive keys.
 */
const SENSITIVE_KEYS = /password|secret|token|authorization|cookie|datasource|connectionstring/i;

function scrub(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;
  const line = JSON.stringify(entry);
  if (entry.level === "error" || entry.level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug(event: string, fields: Record<string, unknown> = {}, requestId?: string): void {
    write({ level: "debug", event, timestamp: new Date().toISOString(), requestId, ...fields });
  },
  info(event: string, fields: Record<string, unknown> = {}, requestId?: string): void {
    write({ level: "info", event, timestamp: new Date().toISOString(), requestId, ...fields });
  },
  warn(event: string, fields: Record<string, unknown> = {}, requestId?: string): void {
    write({ level: "warn", event, timestamp: new Date().toISOString(), requestId, ...scrub(fields) });
  },
  error(event: string, fields: Record<string, unknown> = {}, requestId?: string): void {
    write({ level: "error", event, timestamp: new Date().toISOString(), requestId, ...scrub(fields) });
  },
};

export function newRequestId(): string {
  return randomUUID();
}