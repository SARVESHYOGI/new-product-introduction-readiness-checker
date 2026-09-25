"use client";

import Link from "next/link";
import { useHistory } from "@/lib/client/queries";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

export default function HistoryPage() {
  const { data: checks, isLoading, isError, refetch } = useHistory(undefined, 50);

  if (isLoading) return <LoadingState label="Loading readiness history…" />;
  if (isError || !checks) {
    return (
      <ErrorState
        title="Unable to load history"
        description="We couldn't retrieve the readiness history. Verify the database is reachable and try again."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Readiness history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every check is immutable — later configuration changes never rewrite historical results.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All checks</CardTitle>
          <CardDescription>{checks.length} checks recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <EmptyState
              title="No checks recorded"
              description="Run a readiness check to start building history."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="pb-3 pr-4 font-medium">Product</th>
                    <th scope="col" className="pb-3 pr-4 font-medium">Score</th>
                    <th scope="col" className="pb-3 pr-4 font-medium">Status</th>
                    <th scope="col" className="pb-3 pr-4 font-medium">Passed / Failed</th>
                    <th scope="col" className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((check) => (
                    <tr key={check.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link href={`/readiness/${check.id}`} className="font-medium hover:underline">
                          {check.product?.name ?? check.productId}
                        </Link>
                        {check.product ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {check.product.sku}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{check.score}%</td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={check.status} />
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                        {check.summary.passed} / {check.summary.failed}
                      </td>
                      <td className="py-3 text-muted-foreground">{formatDateTime(check.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}