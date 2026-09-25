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
  BomListItem,
  DashboardStats,
  LineListItem,
  ProductListItem,
  ReadinessCheckInput,
  RoutingListItem,
  SerializedCheck,
  User,
} from "./types";

export const queryKeys = {
  me: ["me"] as const,
  products: (search?: string, status?: string) =>
    ["products", { search, status }] as const,
  product: (id: string) => ["product", id] as const,
  boms: (productId: string) => ["boms", productId] as const,
  routings: (productId: string) => ["routings", productId] as const,
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

export function useLines() {
  return useQuery({
    queryKey: queryKeys.lines,
    queryFn: () =>
      apiFetch<{ lines: LineListItem[] }>("/api/lines").then((d) => d.lines),
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
      queryClient.setQueryData(queryKeys.me, { user });
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