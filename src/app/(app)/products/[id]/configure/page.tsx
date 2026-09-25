"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardCheck, SlidersHorizontal } from "lucide-react";
import { useProduct } from "@/lib/client/queries";
import { describeConfigurationGaps } from "@/lib/configuration";
import { ProductSettingsCard } from "@/components/config/product-settings-card";
import { BomPanel } from "@/components/config/bom-panel";
import { RoutingPanel } from "@/components/config/routing-panel";
import { WorkInstructionsPanel } from "@/components/config/work-instructions-panel";
import { InventoryPanel } from "@/components/config/inventory-panel";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfigStatusBadge } from "@/components/config/config-status-badge";

export default function ProductConfigurationPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id ?? "";
  const product = useProduct(productId);

  if (product.isLoading) return <LoadingState label="Loading product configuration…" />;
  if (product.isError || !product.data) {
    return (
      <ErrorState
        title="Unable to load product configuration"
        description="The product could not be retrieved. Check that it exists and try again."
        onRetry={() => void product.refetch()}
      />
    );
  }

  const p = product.data;
  const configured = p.configuration.isConfigured;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/products/${p.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Product overview
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <SlidersHorizontal className="h-6 w-6 text-primary" aria-hidden="true" />
              Configure {p.name}
            </h1>
            <span className="font-mono text-sm text-muted-foreground">{p.sku}</span>
            <ConfigStatusBadge status={p.status} />
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Assemble the product, routing, instructions, and safety-critical identifiers in one
            place. Changes are versioned or status-based so history remains auditable.
          </p>
          {!configured ? (
            <p className="mt-3 inline-flex rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
              Still missing {describeConfigurationGaps(p.configuration.missing)}. A readiness check
              cannot run until the product has an active BOM version with required components and
              an active routing with operations.
            </p>
          ) : (
            <Badge variant="success" className="mt-3">Ready for a readiness check</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/products/${p.id}`}>View overview</Link>
          </Button>
          <Button asChild disabled={!configured}>
            <Link
              href={configured ? `/readiness?product=${p.id}` : "#"}
              aria-disabled={!configured}
              tabIndex={configured ? undefined : -1}
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Run readiness check
            </Link>
          </Button>
        </div>
      </div>

      <ProductSettingsCard product={p} />
      <BomPanel productId={p.id} />
      <RoutingPanel productId={p.id} />
      <WorkInstructionsPanel productId={p.id} />
      <InventoryPanel productId={p.id} />
    </div>
  );
}
