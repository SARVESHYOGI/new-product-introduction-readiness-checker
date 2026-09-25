"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { useBoms, useHistory, useProduct, useRoutings } from "@/lib/client/queries";
import { describeConfigurationGaps } from "@/lib/configuration";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id ?? "";

  const product = useProduct(productId);
  const boms = useBoms(productId);
  const routings = useRoutings(productId);
  const history = useHistory(productId, 10);

  if (product.isLoading) return <LoadingState label="Loading product…" />;
  if (product.isError || !product.data) {
    return (
      <ErrorState
        title="Unable to load product"
        description="The product could not be retrieved."
        onRetry={() => product.refetch()}
      />
    );
  }

  const p = product.data;
  const { isConfigured, missing } = p.configuration;
  // The checks below use the server-derived configuration so the UI never
  // re-derives readiness business rules from raw counts.
  const missingLabel = describeConfigurationGaps(missing);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All products
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
            <Badge variant={p.status === "ACTIVE" ? "success" : p.status === "DRAFT" ? "secondary" : "muted"}>
              {p.status}
            </Badge>
            <span className="font-mono text-sm text-muted-foreground">{p.sku}</span>
            <Badge
              variant={isConfigured ? "success" : "danger"}
              className="ml-2"
            >
              {isConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {p.description ?? "No description provided."}
          </p>
          {!isConfigured ? (
            <p
              role="status"
              className="mt-3 max-w-2xl rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              This product is missing {missingLabel}. It cannot be checked for production
              readiness until that is configured, and it must never be reported as ready.
            </p>
          ) : null}
        </div>
        <Button asChild size="sm" disabled={!isConfigured}>
          <Link
            href={isConfigured ? `/readiness?product=${p.id}` : "#"}
            aria-disabled={!isConfigured}
            tabIndex={isConfigured ? undefined : -1}
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Run check
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>BOM versions</CardTitle>
            <CardDescription>Bill of materials for {p.name}</CardDescription>
          </CardHeader>
          <CardContent>
            {boms.isLoading ? (
              <LoadingState label="Loading BOMs…" className="py-8" />
            ) : boms.data && boms.data.length > 0 ? (
              <ul className="divide-y">
                {boms.data.map((bom) => (
                  <li key={bom.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">BOM V{bom.version}</p>
                      <p className="text-xs text-muted-foreground">
                        {bom.itemCount} items · effective {bom.effectiveFrom ? formatDateTime(bom.effectiveFrom) : "—"}
                      </p>
                    </div>
                    <Badge variant={bom.status === "ACTIVE" ? "success" : bom.status === "DRAFT" ? "secondary" : "muted"}>
                      {bom.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No BOM versions configured"
                description="No BOM version exists for this product. A BOM must be created before a readiness check can be run."
                className="py-8"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Routings</CardTitle>
            <CardDescription>Manufacturing routes for {p.name}</CardDescription>
          </CardHeader>
          <CardContent>
            {routings.isLoading ? (
              <LoadingState label="Loading routings…" className="py-8" />
            ) : routings.data && routings.data.length > 0 ? (
              <ul className="divide-y">
                {routings.data.map((routing) => (
                  <li key={routing.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{routing.code}</p>
                      <p className="text-xs text-muted-foreground">
                        V{routing.version} · {routing.operationCount} operations
                      </p>
                    </div>
                    <Badge
                      variant={routing.status === "ACTIVE" ? "success" : routing.status === "DRAFT" ? "secondary" : "muted"}
                    >
                      {routing.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No routings configured"
                description="No routing exists for this product. A routing must be created before a readiness check can be run."
                className="py-8"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Readiness history</CardTitle>
          <CardDescription>Latest checks for this product (immutable)</CardDescription>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <LoadingState label="Loading history…" className="py-8" />
          ) : history.data && history.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="pb-3 pr-4 font-medium">Score</th>
                    <th scope="col" className="pb-3 pr-4 font-medium">Status</th>
                    <th scope="col" className="pb-3 pr-4 font-medium">Blockers</th>
                    <th scope="col" className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((check) => (
                    <tr key={check.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 tabular-nums">
                        <Link href={`/readiness/${check.id}`} className="font-medium hover:underline">
                          {check.score}%
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={check.status} />
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                        {check.rootBlockers.length}
                      </td>
                      <td className="py-3 text-muted-foreground">{formatDateTime(check.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No checks yet"
              description="Run a readiness check for this product to see results here."
              action={
                <Button asChild size="sm">
                  <Link href="/readiness">Run a check</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
