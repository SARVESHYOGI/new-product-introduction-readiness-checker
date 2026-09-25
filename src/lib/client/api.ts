/**
 * Typed client-side API layer.
 *
 * Every response is wrapped as `{ data: ... }` or `{ error: { code, message } }`
 * (see src/lib/api/http.ts). This module provides a small fetch wrapper that
 * unwraps those envelopes consistently and surfaces a readable error for the UI.
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiClientError";
    this.code = body.error.code;
    this.status = status;
    this.details = body.error.details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** Request timeout in ms (default 30s). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers, timeoutMs = 30_000, signal } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort);

  try {
    const res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      signal: controller.signal,
    });

    if (res.status === 204) return undefined as T;

    const payload = (await res.json().catch(() => null)) as
      | { data?: T; error?: ApiErrorBody["error"] }
      | null;

    if (!res.ok) {
      if (payload?.error) {
        throw new ApiClientError(res.status, { error: payload.error });
      }
      throw new ApiClientError(res.status, {
        error: { code: "HTTP_ERROR", message: `Request failed with status ${res.status}.` },
      });
    }

    return payload?.data as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiClientError(0, {
        error: {
          code: "TIMEOUT",
          message: "The request timed out. Please try again.",
        },
      });
    }
    throw new ApiClientError(0, {
      error: {
        code: "NETWORK_ERROR",
        message: "Could not reach the server. Check your connection and try again.",
      },
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}