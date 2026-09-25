"use client";

import {
  CircleCheck,
  CircleAlert,
  CircleX,
  TriangleAlert,
  ShieldAlert,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CategoryStatus, ReadinessStatus, ResultStatus } from "@/lib/client/types";

const statusMeta: Record<
  ReadinessStatus | ResultStatus | CategoryStatus,
  { label: string; variant: "success" | "warning" | "danger" | "muted" | "secondary"; icon: typeof CircleCheck }
> = {
  READY: { label: "READY", variant: "success", icon: CircleCheck },
  NOT_READY: { label: "NOT READY", variant: "warning", icon: TriangleAlert },
  BLOCKED: { label: "BLOCKED", variant: "danger", icon: ShieldAlert },
  ERROR: { label: "ERROR", variant: "danger", icon: CircleX },
  PASS: { label: "PASS", variant: "success", icon: CircleCheck },
  WARNING: { label: "WARNING", variant: "warning", icon: CircleAlert },
  FAIL: { label: "FAIL", variant: "danger", icon: CircleX },
  UNVERIFIED: { label: "UNVERIFIED", variant: "muted", icon: Info },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = statusMeta[status as keyof typeof statusMeta] ?? statusMeta.ERROR;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className} role="status">
      <Icon aria-hidden="true" />
      <span>{meta.label}</span>
    </Badge>
  );
}

const severityMeta: Record<string, { variant: "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "muted"; label: string }> = {
  CRITICAL: { variant: "danger", label: "CRITICAL" },
  HIGH: { variant: "warning", label: "HIGH" },
  MEDIUM: { variant: "secondary", label: "MEDIUM" },
  LOW: { variant: "outline", label: "LOW" },
  INFO: { variant: "muted", label: "INFO" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const meta = severityMeta[severity] ?? severityMeta.INFO;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}