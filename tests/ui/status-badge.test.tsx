// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, SeverityBadge } from "@/components/ui/status-badge";

describe("StatusBadge", () => {
  it("renders the semantic label (never color-only) for every status", () => {
    const { rerender } = render(<StatusBadge status="READY" />);
    expect(screen.getByText("READY")).toBeInTheDocument();

    rerender(<StatusBadge status="NOT_READY" />);
    expect(screen.getByText("NOT READY")).toBeInTheDocument();

    rerender(<StatusBadge status="BLOCKED" />);
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();

    rerender(<StatusBadge status="FAIL" />);
    expect(screen.getByText("FAIL")).toBeInTheDocument();

    rerender(<StatusBadge status="WARNING" />);
    expect(screen.getByText("WARNING")).toBeInTheDocument();
  });

  it("exposes a status region for assistive technology", () => {
    render(<StatusBadge status="BLOCKED" />);
    expect(screen.getByRole("status")).toHaveTextContent("BLOCKED");
  });

  it("falls back to ERROR for unknown statuses instead of crashing", () => {
    render(<StatusBadge status="NOPE" />);
    expect(screen.getByText("ERROR")).toBeInTheDocument();
  });
});

describe("SeverityBadge", () => {
  it("renders severity labels with text", () => {
    const { rerender } = render(<SeverityBadge severity="CRITICAL" />);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    rerender(<SeverityBadge severity="HIGH" />);
    expect(screen.getByText("HIGH")).toBeInTheDocument();
    rerender(<SeverityBadge severity="INFO" />);
    expect(screen.getByText("INFO")).toBeInTheDocument();
  });
});