/**
 * Central error model for the API layer.
 *
 * ApiError carries an HTTP status and a stable machine-readable code so the
 * frontend can react without parsing free-form messages.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(code = "UNAUTHORIZED", message = "Authentication required."): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(code = "FORBIDDEN", message = "You do not have permission to perform this action."): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(code = "NOT_FOUND", message = "Resource not found."): ApiError {
    return new ApiError(404, code, message);
  }

  /**
   * 409 — the request was well-formed but conflicts with current state
   * (a duplicate unique value, or a referential constraint that blocks the write).
   */
  static conflict(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(409, code, message, details);
  }

  static tooLarge(code = "PAYLOAD_TOO_LARGE", message = "Request body exceeds the allowed size."): ApiError {
    return new ApiError(413, code, message);
  }

  static tooManyRequests(code = "RATE_LIMITED", message = "Too many requests. Please retry shortly."): ApiError {
    return new ApiError(429, code, message);
  }

  static internal(code = "INTERNAL_ERROR", message = "An unexpected error occurred."): ApiError {
    return new ApiError(500, code, message);
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Fail-safe error used by the readiness engine when verification cannot be completed. */
export class ReadinessVerificationError extends Error {
  constructor(message = "Unable to verify critical production configuration.") {
    super(message);
    this.name = "ReadinessVerificationError";
  }
}