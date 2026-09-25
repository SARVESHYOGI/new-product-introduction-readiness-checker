"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardCheck, LoaderCircle, CircleAlert } from "lucide-react";
import { useBoms, useLines, useProducts, useRoutings, useRunCheck, useMe } from "@/lib/client/queries";
import { ApiClientError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const PHASES = [
  "Validating BOM…",
  "Validating Routing…",
  "Validating Work Instructions…",
  "Validating Stations & Operators…",
  "Analyzing blockers…",
];

export default function RunCheckPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runCheck = useRunCheck();

  const [productId, setProductId] = React.useState(searchParams.get("product") ?? "");
  const [bomVersionId, setBomVersionId] = React.useState("");
  const [routingId, setRoutingId] = React.useState("");
  const [lineId, setLineId] = React.useState("");

  const [runError, setRunError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState(-1);

  const { data: user, isLoading: isUserLoading } = useMe();
  const canRunChecks = user?.role === "ADMIN" || user?.role === "ENGINEER";

  const products = useProducts();
  const boms = useBoms(productId || null);
  const routings = useRoutings(productId || null);
  const lines = useLines();

  const selectedProduct = products.data?.find((p) => p.id === productId);
  const selectedBom = boms.data?.find((b) => b.id === bomVersionId);
  const selectedRouting = routings.data?.find((r) => r.id === routingId);
  const selectedLine = lines.data?.find((l) => l.id === lineId);

  const canRun = Boolean(productId && bomVersionId && routingId && lineId) && !runCheck.isPending;
  const isLoadingOptions =
    products.isLoading || boms.isLoading || routings.isLoading || lines.isLoading;

  const resetDependents = () => {
    setBomVersionId("");
    setRoutingId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRun) return;

    setRunError(null);
    setPhase(0);
    const timer = setInterval(() => {
      setPhase((p) => (p < PHASES.length - 1 ? p + 1 : p));
    }, 400);

    try {
      const check = await runCheck.mutateAsync({
        productId,
        bomVersionId,
        routingId,
        lineId,
      });
      clearInterval(timer);
      router.push(`/readiness/${check.id}`);
    } catch (err) {
      clearInterval(timer);
      setPhase(-1);
      setRunError(
        err instanceof ApiClientError
          ? err.message
          : "We couldn't complete the readiness check. Please try again."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run Readiness Check</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a product, BOM version, routing and production line. The engine validates all
          seven readiness categories deterministically.
        </p>
      </div>

      {isUserLoading ? (
        <LoadingState label="Checking your access…" />
      ) : isLoadingOptions && !products.data ? (
        <LoadingState label="Loading configuration options…" />
      ) : !canRunChecks ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">Read-only access</p>
                <p className="text-muted-foreground">Only engineers and administrators can run readiness checks. View results from the history or dashboard.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : products.isError || !products.data ? (
        <ErrorState
          title="Unable to load products"
          description="We couldn't load the product catalog. Check the API and try again."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Every field is required. BOM and routing are filtered by the selected product.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canRunChecks ? (
                <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="product">Product</Label>
                  <Select
                    value={productId}
                    onValueChange={(v) => {
                      setProductId(v);
                      resetDependents();
                    }}
                  >
                    <SelectTrigger id="product">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.data.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {p.sku}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bom">BOM Version</Label>
                  <Select
                    value={bomVersionId}
                    onValueChange={setBomVersionId}
                    disabled={!productId}
                  >
                    <SelectTrigger id="bom">
                      <SelectValue
                        placeholder={
                          productId
                            ? boms.isError
                              ? "Unable to load BOMs"
                              : "Select a BOM version"
                            : "Select a product first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {boms.data?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          BOM V{b.version} · {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="routing">Routing</Label>
                  <Select
                    value={routingId}
                    onValueChange={setRoutingId}
                    disabled={!productId}
                  >
                    <SelectTrigger id="routing">
                      <SelectValue
                        placeholder={
                          productId
                            ? routings.isError
                              ? "Unable to load routings"
                              : "Select a routing"
                            : "Select a product first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {routings.data?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.code} · V{r.version} · {r.operationCount} op{r.operationCount === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="line">Production Line</Label>
                  <Select value={lineId} onValueChange={setLineId}>
                    <SelectTrigger id="line">
                      <SelectValue placeholder="Select a production line" />
                    </SelectTrigger>
                    <SelectContent>
                      {lines.data?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} · {l.code} · {l.stationCount} station{l.stationCount === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {runError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
                  >
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-medium">We couldn&apos;t complete the readiness check.</p>
                      <p className="text-muted-foreground">{runError}</p>
                    </div>
                  </div>
                ) : null}

                <Button type="submit" size="lg" disabled={!canRun} className="w-full sm:w-auto">
                  {runCheck.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {runCheck.isPending ? "Checking…" : "Run Readiness Check"}
                </Button>
              </form>
              ) : (
                <div className="rounded-md border border-muted bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p>Only engineers and administrators can run readiness checks.</p>
                </div>
              )}

              {runCheck.isPending && phase >= 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-6 space-y-2 rounded-lg border bg-muted/40 p-4"
                >
                  <p className="text-sm font-medium">Checking production readiness…</p>
                  {PHASES.map((label, i) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      {i < phase ? (
                        <span className="text-success" aria-hidden="true">✓</span>
                      ) : i === phase ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                      ) : (
                        <span className="text-muted-foreground/50" aria-hidden="true">○</span>
                      )}
                      <span
                        className={
                          i === phase ? "text-foreground" : i < phase ? "text-muted-foreground" : "text-muted-foreground/50"
                        }
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Selected configuration</CardTitle>
              <CardDescription>Reviewed by the readiness engine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Product</p>
                {selectedProduct ? (
                  <p className="mt-1 font-medium">
                    {selectedProduct.name} <span className="font-mono text-muted-foreground">{selectedProduct.sku}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">BOM Version</p>
                {selectedBom ? (
                  <p className="mt-1 font-medium">
                    BOM V{selectedBom.version} <Badge variant="secondary" className="ml-1">{selectedBom.itemCount} items</Badge>
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Routing</p>
                {selectedRouting ? (
                  <p className="mt-1 font-medium">
                    {selectedRouting.code} <Badge variant="secondary" className="ml-1">{selectedRouting.operationCount} ops</Badge>
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Production Line</p>
                {selectedLine ? (
                  <p className="mt-1 font-medium">
                    {selectedLine.name} <span className="font-mono text-muted-foreground">{selectedLine.code}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {productId && !boms.isLoading && boms.data && boms.data.length === 0 ? (
        <EmptyState
          title="No BOM versions for this product"
          description="This product has no BOM versions. Configure a BOM before running a check."
        />
      ) : null}
    </div>
  );
}
