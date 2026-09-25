"use client";

import { useMemo, useState } from "react";
import {
  CircleCheck,
  CircleX,
  CircleAlert,
  ArrowDown,
  ShieldAlert,
  Wrench,
  ExternalLink,
} from "lucide-react";
import type { CheckResult, SerializedCheck } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, SeverityBadge } from "@/components/ui/status-badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function resultKeyOf(r: { ruleCode: string; affectedEntityId?: string | null }): string {
  return r.affectedEntityId ? `${r.ruleCode}:${r.affectedEntityId}` : r.ruleCode;
}

const CATEGORY_ORDER = [
  "BOM",
  "Routing",
  "Work Instructions",
  "Identifier Range",
  "Inventory Mapping",
  "Operators",
  "Stations",
];

function categoryMeta(status: string) {
  switch (status) {
    case "PASS":
      return { icon: CircleCheck, tone: "text-success", label: "PASS" };
    case "WARNING":
      return { icon: CircleAlert, tone: "text-warning", label: "WARNING" };
    case "FAIL":
      return { icon: CircleX, tone: "text-danger", label: "FAIL" };
    default:
      return { icon: CircleAlert, tone: "text-muted-foreground", label: "UNVERIFIED" };
  }
}

function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "READY") return "success";
  if (status === "BLOCKED") return "danger";
  if (status === "NOT_READY") return "warning";
  return "muted";
}

interface BlockerViewProps {
  check: SerializedCheck;
}

export function CheckResults({ check }: BlockerViewProps) {
  const [openResult, setOpenResult] = useState<CheckResult | null>(null);

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => check.categoryStatuses[c]),
    ...Object.keys(check.categoryStatuses).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  const failedChecks = check.checks.filter((c) => c.status === "FAIL");
  const warningChecks = check.checks.filter((c) => c.status === "WARNING");

  return (
    <div className="space-y-8">
      {/* Header: score + status + summary */}
      <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-card p-6 shadow-sm">
        <ScoreRing value={check.score} tone={statusTone(check.status)} size="lg" />
        <div className="flex-1 min-w-52">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              {check.status === "READY" ? "Production configuration is ready" : "Production is not ready"}
            </h2>
            <StatusBadge status={check.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {check.status === "READY" ? (
              "All required manufacturing configuration is valid and verified."
            ) : check.status === "BLOCKED" ? (
              "Critical configuration problems block production. Do not release to production."
            ) : (
              <>
                {check.summary.blocking} blocker{check.summary.blocking === 1 ? "" : "s"} require attention
                before production can proceed.
              </>
            )}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
            {[
              ["Total checks", check.summary.total],
              ["Passed", check.summary.passed],
              ["Warnings", check.summary.warnings],
              ["Failed", check.summary.failed],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Root blockers */}
      {check.rootBlockers.length > 0 ? (
        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-danger">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              Root blockers
            </CardTitle>
            <CardDescription>
              Underlying causes that require remediation. Dependent failures are grouped under
              these, not repeated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {check.rootBlockers.map((root, i) => (
              <article key={i} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="danger">ROOT BLOCKER</Badge>
                  <SeverityBadge severity={root.severity} />
                  <span className="font-mono text-xs text-muted-foreground">{root.ruleCode}</span>
                </div>
                <h3 className="mt-2 font-semibold">{root.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{root.message}</p>
                {root.remediation ? (
                  <p className="mt-2 flex items-start gap-2 text-sm">
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>
                      <span className="font-medium">Recommended action: </span>
                      {root.remediation}
                    </span>
                  </p>
                ) : null}
                {root.impacts.length > 0 ? (
                  <div className="mt-3 flex items-start gap-2 text-sm">
                    <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>
                      <span className="font-medium">This affects: </span>
                      {root.impacts.join(", ")}
                    </span>
                  </div>
                ) : (
                  <p className="mt-3 flex items-start gap-2 text-sm">
                    <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>
                      <span className="font-medium">Affected entity: </span>
                      {root.affectedEntityType ? `${root.affectedEntityType}` : "Configuration"}
                      {root.affectedEntityId ? ` · ${root.affectedEntityId}` : ""}
                    </span>
                  </p>
                )}
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Category summary */}
      <Card>
        <CardHeader>
          <CardTitle>Category results</CardTitle>
          <CardDescription>Seven readiness categories reviewed by the engine</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {orderedCategories.map((category) => {
              const status = check.categoryStatuses[category] ?? "UNVERIFIED";
              const meta = categoryMeta(status);
              const Icon = meta.icon;
              return (
                <li key={category} className="flex items-center justify-between gap-4 py-3">
                  <span className="flex items-center gap-3 text-sm font-medium">
                    <Icon className={cn("h-4 w-4", meta.tone)} aria-hidden="true" />
                    {category}
                  </span>
                  <Badge
                    variant={
                      status === "PASS" ? "success" : status === "FAIL" ? "danger" : status === "WARNING" ? "warning" : "muted"
                    }
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {meta.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Detailed checks */}
      <Card>
        <CardHeader>
          <CardTitle>Check details</CardTitle>
          <CardDescription>Click a failed check to see problem, impact and remediation</CardDescription>
        </CardHeader>
        <CardContent>
          {check.checks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No individual checks were recorded.</p>
          ) : (
            <ul className="divide-y">
              {check.checks.map((result, i) => {
                const meta = categoryMeta(result.status);
                const Icon = meta.icon;
                const clickable = result.status === "FAIL";
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && setOpenResult(result)}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 py-3 text-left",
                        clickable && "rounded-md px-2 transition-colors hover:bg-accent"
                      )}
                      aria-label={clickable ? `View details for ${result.title}` : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Icon className={cn("h-4 w-4 shrink-0", meta.tone)} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{result.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {result.category} · {result.ruleCode}
                            {result.affectedEntityId ? ` · ${result.affectedEntityId}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <SeverityBadge severity={result.severity} />
                        <Badge
                          variant={
                            result.status === "PASS" ? "success" : result.status === "FAIL" ? "danger" : "warning"
                          }
                        >
                          {result.status}
                        </Badge>
                        {clickable ? (
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <BlockerDialog
        result={openResult}
        onClose={() => setOpenResult(null)}
        checks={check.checks}
      />

      {warningChecks.length + failedChecks.length === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          Results are immutable: configuration changes after this check require a new check.
        </p>
      )}
    </div>
  );
}

interface BlockerDialogProps {
  result: CheckResult | null;
  onClose: () => void;
  checks: CheckResult[];
}

function BlockerDialog({ result, onClose, checks }: BlockerDialogProps) {
  const related = useMemo(() => {
    if (!result || !result.causeRuleCode) return undefined;
    return checks.find((c) => resultKeyOf(c) === result.causeRuleCode);
  }, [result, checks]);

  if (!result) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CircleX className="h-5 w-5 text-danger" aria-hidden="true" />
            <DialogTitle>{result.title}</DialogTitle>
          </div>
          <DialogDescription>
            {result.category} · {result.ruleCode} · <SeverityBadge severity={result.severity} />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-danger">Failed</h4>
            <p className="mt-1">{result.message}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problem</h4>
            <p className="mt-1 text-muted-foreground">{result.message}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impact</h4>
            {related ? (
              <p className="mt-1 text-muted-foreground">
                Caused by <span className="font-medium text-foreground">{related.title}</span> — production
                cannot safely proceed for this step.
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Production cannot safely execute this configuration until resolved.
              </p>
            )}
          </div>

          {result.remediation ? (
            <div className="rounded-md border bg-success-soft p-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success">
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                Recommended action
              </h4>
              <p className="mt-1">{result.remediation}</p>
            </div>
          ) : null}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Affected entity
            </h4>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {result.affectedEntityType ?? "Configuration"}
              {result.affectedEntityId ? ` · ${result.affectedEntityId}` : ""}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}