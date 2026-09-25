"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Boxes, Plus, Settings2 } from "lucide-react";
import { useMe, useProducts } from "@/lib/client/queries";
import { describeConfigurationGaps } from "@/lib/configuration";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

const productStatusVariant = {
  ACTIVE: "success",
  DRAFT: "secondary",
  INACTIVE: "muted",
} as const;

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { data: user } = useMe();
  const { data: products, isLoading, isError, refetch } = useProducts(search || undefined);

  const isAdminUser = user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catalog and latest readiness status per product
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Search products"
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {isAdminUser ? (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add product
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading products…" />
      ) : isError || !products ? (
        <ErrorState
          title="Unable to load products"
          description="We couldn't load the product catalog. Check the API and try again."
          onRetry={() => refetch()}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            search ? `No products match "${search}". Try a different search.` : "The catalog is empty."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card
              key={product.id}
              data-testid={`product-card-${product.id}`}
              className="transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={productStatusVariant[product.status]}>
                      {product.status}
                    </Badge>
                    <Badge
                      variant={product.configuration.isConfigured ? "success" : "warning"}
                      title={
                        product.configuration.isConfigured
                          ? "This product has an active BOM version with required components and an active routing with operations."
                          : `Missing: ${product.configuration.missing.join(", ")}`
                      }
                    >
                      {product.configuration.isConfigured ? "CHECKABLE" : "NOT CHECKABLE"}
                    </Badge>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                </div>
                <CardTitle className="mt-2">
                  <Link href={`/products/${product.id}`} className="hover:underline">
                    {product.name}
                  </Link>
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {product.description ?? "No description provided."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{product._count.bomVersions} BOMs</span>
                  <span>{product._count.routings} routings</span>
                  <span>{product._count.readinessChecks} checks</span>
                </div>
                {!product.configuration.isConfigured ? (
                  <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                    Cannot be checked — missing{" "}
                    {describeConfigurationGaps(product.configuration.missing)}.
                  </p>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest check
                  </span>
                  {product.lastCheckStatus ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">{product.lastCheckScore}%</span>
                      <StatusBadge status={product.lastCheckStatus} />
                    </div>
                  ) : product.configuration.isConfigured ? (
                    <span className="text-xs text-muted-foreground">Never checked</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No check possible yet</span>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={
                        product.configuration.isConfigured && product.lastCheckStatus
                          ? `/readiness?product=${product.id}`
                          : `/products/${product.id}`
                      }
                    >
                      <Boxes className="h-4 w-4" aria-hidden="true" />
                      View details
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/products/${product.id}/configure`}>
                      <Settings2 className="h-4 w-4" aria-hidden="true" />
                      Configure
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddProductDialog open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}