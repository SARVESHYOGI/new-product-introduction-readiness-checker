// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreRing } from "@/components/ui/score-ring";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

describe("ScoreRing", () => {
  it("renders the numeric value as text with an accessible label", () => {
    render(<ScoreRing value={71} tone="danger" />);
    expect(screen.getByRole("img", { name: "readiness score: 71%" })).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument();
  });

  it("clamps out-of-range values", () => {
    const { rerender } = render(<ScoreRing value={150} />);
    expect(screen.getByRole("img", { name: "readiness score: 100%" })).toBeInTheDocument();
    rerender(<ScoreRing value={-5} />);
    expect(screen.getByRole("img", { name: "readiness score: 0%" })).toBeInTheDocument();
  });

  it("supports a custom label", () => {
    render(<ScoreRing value={86} label="readiness" />);
    expect(screen.getByRole("img", { name: "readiness: 86%" })).toBeInTheDocument();
  });
});

describe("UX states", () => {
  it("LoadingState announces its message politely", () => {
    render(<LoadingState label="Checking production readiness…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking production readiness…");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("EmptyState shows title and description", () => {
    render(<EmptyState title="No products found." description="Create a product to begin." />);
    expect(screen.getByText("No products found.")).toBeInTheDocument();
    expect(screen.getByText("Create a product to begin.")).toBeInTheDocument();
  });

  it("ErrorState shows an alert and retries when requested", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="Unable to load products." description="Try again." onRetry={onRetry} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load products.");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});