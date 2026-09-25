"use client";

import Link from "next/link";
import {
  Boxes,
  Factory,
  CircleCheck,
  ShieldAlert,
  TriangleAlert,
  ArrowRight,
} from "lucide-react";
import { useDashboardStats } from "@/lib/client/queries";
import { formatRelativeTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

function statTone(value: number, kind: "success" | "danger" | "warning" | "neutral") {
  if (kind === "success") return "text-success";
  if (kind === "danger") return "text-danger";
  if (kind === "warning") return "text-warning";
  return "text-foreground";
}

export default function DashboardPage() {
  const { data: stats, isLoading, isError, refetch } = useDashboardStats();

  if (isLoading) return <LoadingState label="Loading dashboard…" className="min-h-64" />;
  if (isError || !stats) {
    return (
      <ErrorState
        title="Unable to load dashboard"
        description="We couldn't retrieve the readiness overview. Verify the database is reachable and try again."
        onRetry={() => refetch()}
      />
    );
  }

  const cards = [
    { label: "Products", value: stats.productCount, hint: "in catalog", icon: Boxes, tone: "neutral" as const },
    { label: "Active Lines", value: stats.activeLineCount, hint: "production lines", icon: Factory, tone: "neutral" as const },
    { label: "Ready", value: stats.readyProductCount, hint: "latest check", icon: CircleCheck, tone: "success" as const },
    { label: "Not Ready", value: stats.notReadyProductCount, hint: "latest check", icon: TriangleAlert, tone: "warning" as const },
    { label: "Blocked", value: stats.blockedProductCount, hint: "latest check", icon: ShieldAlert, tone: "danger" as const },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Production readiness across new product introductions
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {stats.checkCount} readiness check{stats.checkCount === 1 ? "" : "s"} executed
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </span>
                  <Icon className={`h-4 w-4 ${statTone(card.value, card.tone)}`} aria-hidden="true" />
                </div>
                <p className={`mt-3 text-3xl font-semibold tabular-nums ${statTone(card.value, card.tone)}`}>
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Recent readiness checks</CardTitle>
          <Link
            href="/history"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent>
          {stats.recentChecks.length === 0 ? (
            <EmptyState
              title="No readiness checks yet"
              description="Run your first readiness check to see results here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="pb-3 pr-4 font-medium">Product</th>
                    <th scope="col" className="pb-3 pr-4 font-medium">Score</th>
                    <th scope="col" className="pb-3 pr-4 font-medium">Status</th>
                    <th scope="col" className="pb-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentChecks.map((check) => (
                    <tr key={check.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link href={`/readiness/${check.id}`} className="font-medium hover:underline">
                          {check.productName}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {check.productSku}
                        </span>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{check.score}%</td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={check.status} />
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatRelativeTime(check.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Readiness at a glance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-8">
          {stats.recentChecks.slice(0, 4).map((check) => (
            <Link
              key={check.id}
              href={`/readiness/${check.id}`}
              className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <ScoreRing
                value={check.score}
                size="sm"
                tone={check.status === "READY" ? "success" : check.status === "BLOCKED" ? "danger" : check.status === "NOT_READY" ? "warning" : "muted"}
              />
              <div>
                <p className="text-sm font-medium">{check.productName}</p>
                <StatusBadge status={check.status} />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}