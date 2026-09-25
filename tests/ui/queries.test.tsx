// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLogin, useMe } from "@/lib/client/queries";
import type { User } from "@/lib/client/types";

/**
 * Regression coverage for an auth cache-shape bug:
 *
 * useMe()'s queryFn returns the *unwrapped* user (d.user), so every consumer
 * reads `data.role` / `data.name` directly. useLogin() previously cached the
 * wrapped object `{ user }` under the same key, so the first client-side
 * navigation after signing in returned the wrapper as "the user" and every
 * role check collapsed to undefined — e.g. admins saw "Read-only access" on
 * the Run Check page. These tests pin both sides of the contract:
 *
 *   1. login writes the same shape useMe() reads (no refetch needed), and
 *   2. a fresh mount refetches from /api/auth/me and unwraps correctly.
 */

const ADMIN: User = {
  id: "user_admin",
  email: "admin@npi.local",
  name: "Admin One",
  role: "ADMIN",
};

const ENGINEER: User = {
  id: "user_eng",
  email: "engineer@npi.local",
  name: "Engineer One",
  role: "ENGINEER",
};

function okResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function makeWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("auth query cache contract", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login caches the unwrapped user so useMe consumers see the role", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/login") {
        return okResponse({ data: { user: ADMIN } });
      }
      if (url === "/api/auth/me") {
        return okResponse({ data: { user: ADMIN } });
      }
      return okResponse({ data: null });
    });

    const { result } = renderHook(
      () => ({ login: useLogin(), me: useMe() }),
      { wrapper: makeWrapper() }
    );

    // Sign in — this writes the `me` cache exactly like the real login form.
    await act(async () => {
      await result.current.login.mutateAsync({
        email: "admin@npi.local",
        password: "admin123",
      });
    });

    // No refetch of /api/auth/me should be needed: the cache holds the user.
    await waitFor(() => {
      expect(result.current.me.data).toEqual(ADMIN);
      expect(result.current.me.data?.role).toBe("ADMIN");
    });
    expect(result.current.me.data?.role).not.toBeUndefined();
    // The query must not have refetched just to answer — it was served cache.
    const meCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/auth/me"
    );
    expect(meCalls.length).toBeLessThanOrEqual(1);
  });

  it("useMe refetches and unwraps the user on a fresh mount", async () => {
    fetchMock.mockResolvedValue(okResponse({ data: { user: ENGINEER } }));

    const { result } = renderHook(() => useMe(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.data?.role).toBe("ENGINEER");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ method: "GET" })
    );
  });
});