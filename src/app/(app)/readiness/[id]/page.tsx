"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCheck } from "@/lib/client/queries";
import { formatDateTime } from "@/lib/utils";
import { CheckResults } from "@/components/readiness/check-results";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function CheckDetailPage() {
  const params = useParams<{ id: string }>();
  const checkId = params?.id ?? "";
  const { data: check, isLoading, isError, refetch } = useCheck(checkId);

  if (isLoading) return <LoadingState label="Loading readiness result…" />;
  if (isError || !check) {
    return (
      <ErrorState
        title="Unable to load readiness check"
        description="The check could not be retrieved. It may have been removed, or the database is unreachable."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/readiness"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Run another check
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {check.product?.name ?? `Readiness check ${check.id}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {check.bomVersion ? <>BOM V{check.bomVersion.version}</> : null}
            {check.routing ? <> · {check.routing.code}</> : null}
            {check.line ? <> · {check.line.name}</> : null}
            {" · "}
            {formatDateTime(check.createdAt)}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/history">View history</Link>
        </Button>
      </div>

      <CheckResults check={check} />
    </div>
  );
}