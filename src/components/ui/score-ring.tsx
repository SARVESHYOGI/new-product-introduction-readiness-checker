"use client";

import { cn } from "@/lib/utils";

interface ScoreRingProps {
  /** 0–100 readiness score. */
  value: number;
  tone?: "success" | "warning" | "danger" | "muted";
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const toneColor: Record<NonNullable<ScoreRingProps["tone"]>, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  muted: "var(--muted-foreground)",
};

const sizeConfig = {
  sm: { ring: 48, stroke: 5, text: "text-sm" },
  md: { ring: 88, stroke: 7, text: "text-xl" },
  lg: { ring: 132, stroke: 9, text: "text-3xl" },
} as const;

/**
 * Accessible circular progress indicator. The numeric value is rendered as
 * text (never color-only), with an SVG ring as the visual affordance.
 */
export function ScoreRing({
  value,
  tone = "muted",
  size = "md",
  label = "readiness score",
  className,
}: ScoreRingProps) {
  const { ring, stroke, text } = sizeConfig[size];
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      role="img"
      aria-label={`${label}: ${clamped}%`}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: ring, height: ring }}
    >
      <svg width={ring} height={ring} className="-rotate-90" aria-hidden="true">
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke={toneColor[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms ease-in-out" }}
        />
      </svg>
      <span
        className={cn(
          "absolute font-semibold tabular-nums",
          text,
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger"
        )}
      >
        {clamped}
        <span className="text-[0.5em] font-normal text-muted-foreground">%</span>
      </span>
    </div>
  );
}