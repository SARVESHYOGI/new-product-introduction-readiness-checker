// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddProductDialog } from "@/components/products/add-product-dialog";

/**
 * The Add Product dialog runs the *same* Zod schema as POST /api/products, so
 * client validation and the network payload must match the server contract.
 */

function okResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function renderDialog(onOpenChange: (open: boolean) => void = () => undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddProductDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
}

describe("AddProductDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows validation errors for missing required fields and makes no request", async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    // Both required fields produce a Zod error (shared server schema).
    let alerts: HTMLElement[] = [];
    await waitFor(() => {
      alerts = screen.getAllByRole("alert");
      expect(alerts.length).toBe(2);
    });
    for (const alert of alerts) {
      expect(alert).toHaveTextContent(/expected string to have/);
    }
    // Validation blocked submission — no network request was made.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the shared schema payload and closes on success", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        data: {
          product: {
            id: "prod_new",
            sku: "SWX-1100",
            name: "Smart Watch X2",
            status: "DRAFT",
          },
        },
      })
    );
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.change(screen.getByLabelText("SKU"), {
      target: { value: "SWX-1100" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Smart Watch X2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/products");
    expect(options.method).toBe("POST");
    const body = JSON.parse(String(options.body));
    expect(body).toEqual({
      sku: "SWX-1100",
      name: "Smart Watch X2",
      status: "DRAFT", // select defaults to DRAFT
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("surfaces server-side errors (e.g. duplicate SKU) instead of closing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: "DUPLICATE_SKU",
          message: "A product with SKU SWX-1000 already exists.",
        },
      }),
    } as Response);
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.change(screen.getByLabelText("SKU"), {
      target: { value: "SWX-1000" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Duplicate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(
        screen.getByText("A product with SKU SWX-1000 already exists.")
      ).toBeInTheDocument();
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});