import { ApiError, isApiError } from "@/lib/errors";
import { logger, newRequestId } from "@/lib/logging/logger";

/** Maximum accepted JSON body size (256 KB) for write endpoints. */
export const MAX_BODY_BYTES = 256 * 1024;

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Parse and validate a JSON request body with content-type and size guards. */
export async function readJsonBody<T>(req: Request): Promise<T> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw ApiError.badRequest(
      "INVALID_CONTENT_TYPE",
      "Content-Type must be application/json."
    );
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw ApiError.tooLarge();
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw ApiError.tooLarge();
  }
  if (text.length === 0) {
    throw ApiError.badRequest("EMPTY_BODY", "Request body is required.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw ApiError.badRequest("MALFORMED_JSON", "Request body is not valid JSON.");
  }
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function fail(error: unknown, requestId?: string): Response {
  if (isApiError(error)) {
    const body: ErrorBody = { error: { code: error.code, message: error.message } };
    if (error.details !== undefined) body.error.details = error.details;
    return Response.json(body, { status: error.status });
  }

  logger.error("unhandled_error", { requestId, error: String(error) }, requestId);

  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred."
      : error instanceof Error
        ? error.message
        : String(error);

  const body: ErrorBody = { error: { code: "INTERNAL_ERROR", message } };
  return Response.json(body, { status: 500 });
}

export function notFoundResponse(entity: string, id: string): Response {
  return fail(ApiError.notFound("NOT_FOUND", `${entity} with id ${id} was not found.`));
}

/**
 * Wrap a route handler with request-scoped logging and consistent error
 * handling. Logs method, path, status, and duration; never logs bodies.
 */
export function withRequestLog(
  handler: (req: Request, ctx: unknown) => Promise<Response>
): (req: Request, ctx: unknown) => Promise<Response> {
  return async (req, ctx) => {
    const requestId = newRequestId();
    const startedAt = Date.now();
    const url = new URL(req.url);

    logger.info("request_start", {
      requestId,
      method: req.method,
      path: url.pathname,
    });

    try {
      const res = await handler(req, ctx);
      logger.info("request_end", {
        requestId,
        method: req.method,
        path: url.pathname,
        status: res.status,
        durationMs: Date.now() - startedAt,
      });
      return res;
    } catch (err) {
      const res = fail(err, requestId);
      logger.warn("request_error", {
        requestId,
        method: req.method,
        path: url.pathname,
        status: res.status,
        durationMs: Date.now() - startedAt,
      });
      return res;
    }
  };
}

class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number
  ) {}

  /** Returns true when the request is allowed. */
  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

/**
 * Dev-grade in-memory rate limiter, scoped per instance.
 * Suitable for a single-process deployment; for multi-instance production,
 * swap for a shared store (e.g. Redis).
 */
export const loginRateLimiter = new SlidingWindowLimiter(60_000, 10);
export const readinessRateLimiter = new SlidingWindowLimiter(60_000, 60);

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Resolve a required dynamic route parameter (Next.js App Router passes
 * `params` as a Promise). Throws 400 when missing.
 */
export async function requiredParam(
  ctx: unknown,
  key: string
): Promise<string> {
  const params = (ctx as { params?: Promise<Record<string, string>> })?.params;
  const resolved = await params;
  const value = resolved?.[key];
  if (!value) {
    throw ApiError.badRequest("MISSING_PARAM", `Missing route parameter '${key}'.`);
  }
  return value;
}