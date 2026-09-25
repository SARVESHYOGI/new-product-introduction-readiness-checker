"use client";

/**
 * TanStack Query hooks for the NPI API. Each hook owns its fetch + caching +
 * error surface so pages stay declarative.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "./api";
import type {
  BomDetail,
  BomListItem,
  DashboardStats,
  LineListItem,
  OperatorListItem,
  ProductInventoryConfig,
  ProductListItem,
  ReadinessCheckInput,
  RoutingDetail,
  RoutingListItem,
  SerializedCheck,
  StationListItem,
  InventoryItemListItem,
  User,
  WorkInstructionListItem,
} from "./types";

export const queryKeys = {
  me: ["me"] as const,
  products: (search?: string, status?: string) =>
    ["products", { search, status }] as const,
  product: (id: string) => ["product", id] as const,
  boms: (productId: string) => ["boms", productId] as const,
  bom: (id: string) => ["bom", id] as const,
  routings: (productId: string) => ["routings", productId] as const,
  routing: (id: string) => ["routing", id] as const,
  lines: ["lines"] as const,
  dashboard: ["dashboard"] as const,
  check: (id: string) => ["check", id] as const,
  history: (productId?: string, limit = 20) =>
    ["history", productId ?? "all", limit] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<{ user: User }>("/api/auth/me").then((d) => d.user),
    staleTime: 60_000,
    retry: false,
  });
}

export function useProducts(search?: string, status?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  const query = params.toString();
  return useQuery({
    queryKey: queryKeys.products(search, status),
    queryFn: () =>
      apiFetch<{ products: ProductListItem[] }>(
        `/api/products${query ? `?${query}` : ""}`
      ).then((d) => d.products),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.product(id),
    queryFn: () =>
      apiFetch<{ product: ProductListItem }>(`/api/products/${id}`).then(
        (d) => d.product
      ),
    enabled: Boolean(id),
  });
}

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  status?: "DRAFT" | "ACTIVE" | "INACTIVE";
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      apiFetch<{ product: ProductListItem }>("/api/products", {
        method: "POST",
        body: input,
      }).then((d) => d.product),
    onSuccess: async () => {
      // A new product refreshes the catalog and the dashboard counts.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.products() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
    },
  });
}

export function useBoms(productId: string | null) {
  return useQuery({
    queryKey: queryKeys.boms(productId ?? ""),
    queryFn: () =>
      apiFetch<{ boms: BomListItem[] }>(`/api/products/${productId}/boms`).then(
        (d) => d.boms
      ),
    enabled: Boolean(productId),
  });
}

export function useBom(id: string | null) {
  return useQuery({
    queryKey: queryKeys.bom(id ?? ""),
    queryFn: () => apiFetch<{ bom: BomDetail }>(`/api/boms/${id}`).then((d) => d.bom),
    enabled: Boolean(id),
  });
}

export function useRoutings(productId: string | null) {
  return useQuery({
    queryKey: queryKeys.routings(productId ?? ""),
    queryFn: () =>
      apiFetch<{ routings: RoutingListItem[] }>(
        `/api/products/${productId}/routings`
      ).then((d) => d.routings),
    enabled: Boolean(productId),
  });
}

export function useRouting(id: string | null) {
  return useQuery({
    queryKey: queryKeys.routing(id ?? ""),
    queryFn: () =>
      apiFetch<{ routing: RoutingDetail }>(`/api/routings/${id}`).then((d) => d.routing),
    enabled: Boolean(id),
  });
}

/**
 * Lines available for selection.
 *
 * Defaults to ACTIVE only, which is what the Run Check selector needs — an
 * inactive line must never be offered for a new check. The configuration editor
 * passes `includeInactive` so an INACTIVE line stays visible and re-assignable.
 */
export function useLines(includeInactive = false) {
  return useQuery({
    queryKey: [...queryKeys.lines, { includeInactive }],
    queryFn: () =>
      apiFetch<{ lines: LineListItem[] }>(
        `/api/lines?includeInactive=${includeInactive}`
      ).then((d) => d.lines),
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () =>
      apiFetch<{ stats: DashboardStats }>("/api/dashboard/stats").then(
        (d) => d.stats
      ),
  });
}

export function useCheck(id: string) {
  return useQuery({
    queryKey: queryKeys.check(id),
    queryFn: () =>
      apiFetch<{ check: SerializedCheck }>(`/api/readiness/${id}`).then(
        (d) => d.check
      ),
    enabled: Boolean(id),
  });
}

export function useHistory(productId?: string, limit = 20) {
  return useQuery({
    queryKey: queryKeys.history(productId, limit),
    queryFn: () =>
      apiFetch<{ checks: SerializedCheck[] }>(
        productId
          ? `/api/products/${productId}/readiness-history?limit=${limit}`
          : `/api/readiness?limit=${limit}`
      ).then((d) => d.checks),
  });
}

export function useRunCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReadinessCheckInput) =>
      apiFetch<{ check: SerializedCheck }>("/api/readiness/check", {
        method: "POST",
        body: input,
      }).then((d) => d.check),
    onSuccess: async (check) => {
      // Cache the unwrapped check — the same shape useCheck()'s queryFn stores,
      // so navigation straight from a run renders the detail page correctly.
      queryClient.setQueryData(queryKeys.check(check.id), check);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.history(check.productId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products() }),
      ]);
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiFetch<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: credentials,
      }).then((d) => d.user),
    onSuccess: (user) => {
      // Cache the *unwrapped* user — the same shape useMe()'s queryFn stores.
      // Caching { user } here breaks every useMe() consumer after a client-side
      // navigation (role becomes undefined) because data is read straight from
      // this cache without a refetch.
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}

// ===========================================================================
// Configuration editor hooks
//
// Every mutation invalidates the caches its change can affect. The rule of
// thumb: a write to `X` invalidates `X`'s list, its parent's detail (because the
// parent shows counts/status), the product list (configuration badge), and the
// dashboard (counts). Readiness history is NEVER invalidated — checks are
// immutable by design, so editing configuration cannot change a past result.
// ===========================================================================

export const configQueryKeys = {
  stations: ["stations"] as const,
  operators: ["operators"] as const,
  workInstructions: (productId?: string) =>
    ["work-instructions", { productId: productId ?? "all" }] as const,
  inventoryItems: ["inventory-items"] as const,
  productInventory: (productId: string) => ["product-inventory", productId] as const,
} as const;

/** Caches invalidated after any configuration write. */
function invalidateConfig(
  queryClient: ReturnType<typeof useQueryClient>,
  extra: readonly unknown[][] = []
): Promise<unknown> {
  return Promise.all([
    // Catalog + aggregate counts.
    queryClient.invalidateQueries({ queryKey: ["products"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
    // Product detail (last-check/status badges live here too).
    queryClient.invalidateQueries({ queryKey: ["product"] }),
    // BOM and routing *lists* and *details* use different key prefixes, and a
    // write to one can change the other (adding an operation renumbers nothing
    // but changes the detail's operation count).
    queryClient.invalidateQueries({ queryKey: ["bom"] }),
    queryClient.invalidateQueries({ queryKey: ["boms"] }),
    queryClient.invalidateQueries({ queryKey: ["routing"] }),
    queryClient.invalidateQueries({ queryKey: ["routings"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.lines }),
    queryClient.invalidateQueries({ queryKey: configQueryKeys.stations }),
    queryClient.invalidateQueries({ queryKey: configQueryKeys.operators }),
    queryClient.invalidateQueries({ queryKey: configQueryKeys.inventoryItems }),
    // Prefix match: every product's inventory config, because deactivating a
    // shared inventory item or station can change any product's advisories.
    queryClient.invalidateQueries({ queryKey: ["product-inventory"] }),
    queryClient.invalidateQueries({ queryKey: ["work-instructions"] }),
    ...extra.map((key) => queryClient.invalidateQueries({ queryKey: key })),
  ]);
}

/**
 * All stations, including INACTIVE and MAINTENANCE ones. The API deliberately
 * has no "active only" mode: a configuration editor must be able to see and fix
 * the states that block production.
 */
export function useStations() {
  return useQuery({
    queryKey: configQueryKeys.stations,
    queryFn: () =>
      apiFetch<{ stations: StationListItem[] }>("/api/stations").then((d) => d.stations),
  });
}

export function useOperators(includeInactive = true) {
  return useQuery({
    queryKey: [...configQueryKeys.operators, { includeInactive }],
    queryFn: () =>
      apiFetch<{ operators: OperatorListItem[] }>(
        `/api/operators?includeInactive=${includeInactive}`
      ).then((d) => d.operators),
  });
}

export function useWorkInstructions(productId?: string) {
  return useQuery({
    queryKey: configQueryKeys.workInstructions(productId),
    queryFn: () =>
      apiFetch<{ instructions: WorkInstructionListItem[] }>(
        `/api/work-instructions?${new URLSearchParams(productId ? { productId } : {})}`
      ).then((d) => d.instructions),
  });
}

export function useProductInventory(productId: string | null) {
  return useQuery({
    queryKey: configQueryKeys.productInventory(productId ?? "none"),
    queryFn: () =>
      apiFetch<ProductInventoryConfig>(`/api/products/${productId}/inventory`),
    enabled: Boolean(productId),
  });
}

export function useInventoryItems() {
  return useQuery({
    queryKey: configQueryKeys.inventoryItems,
    queryFn: () =>
      apiFetch<{ items: InventoryItemListItem[] }>("/api/inventory-items").then((d) => d.items),
  });
}

/**
 * Generic write mutation factory.
 *
 * The configuration editor has ~25 write endpoints that all behave identically:
 * POST/PATCH/DELETE, then invalidate the affected caches. Expressing them as
 * one factory keeps each dialog down to `useConfigWrite(...)` and means cache
 * invalidation can never be forgotten on a new endpoint.
 */
export function useConfigWrite<TResult = unknown>() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      path: string;
      method: "POST" | "PATCH" | "DELETE";
      body?: unknown;
      /** Extra query keys to invalidate, e.g. the affected product's list. */
      invalidate?: readonly unknown[][];
    }) => apiFetch<TResult>(vars.path, {
      method: vars.method,
      body: vars.body,
    }),
    onSuccess: (_data, vars) => invalidateConfig(queryClient, vars.invalidate ?? []),
  });
}