"use client";

import { TriangleAlert } from "lucide-react";
import type { AdvisoryConflict } from "@/lib/client/types";

/**
 * Renders the advisory conflicts a write endpoint returned.
 *
 * This is deliberately labelled as *advisory*. It tells the engineer "this edit
 * is very likely to produce a blocking failure" — it never decides anything. The
 * deterministic readiness engine remains the only authority on whether a
 * configuration is safe, and the copy says so explicitly so nobody mistakes a
 * green save for a green check.
 */
export function ConflictNotice({
  conflicts,
  className,
}: {
  conflicts: AdvisoryConflict[];
  className?: string;
}) {
  if (conflicts.length === 0) return null;

  return (
    <div
      role="status"
      className={`rounded-md border border-warning/40 bg-warning-soft p-3 text-sm ${className ?? ""}`}
    >
      <p className="flex items-center gap-2 font-medium text-warning">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        Saved with {conflicts.length === 1 ? "a warning" : `${conflicts.length} warnings`}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        {conflicts.map((c) => (
          <li key={c.code}>
            <span className="font-medium text-foreground">{c.message}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Advisory only — run a readiness check to get the authoritative decision.
      </p>
    </div>
  );
}
