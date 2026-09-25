"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Status pill for configuration entities.
 *
 * Uses text + colour together (never colour alone) so the state is legible
 * without colour perception. `MAINTENANCE` gets its own treatment because it is
 * the state that makes a station fail Safety Rule 5 outright.
 */
const configStatusMeta: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" | "muted" | "secondary" | "outline" }
> = {
  ACTIVE: { label: "ACTIVE", variant: "success" },
  DRAFT: { label: "DRAFT", variant: "secondary" },
  OBSOLETE: { label: "OBSOLETE", variant: "muted" },
  INACTIVE: { label: "INACTIVE", variant: "danger" },
  MAINTENANCE: { label: "MAINTENANCE", variant: "warning" },
  EXPIRED: { label: "EXPIRED", variant: "muted" },
  REVOKED: { label: "REVOKED", variant: "muted" },
  EXHAUSTED: { label: "EXHAUSTED", variant: "warning" },
};

export function ConfigStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = configStatusMeta[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  );
}
