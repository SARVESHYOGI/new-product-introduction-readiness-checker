"use client";

import Link from "next/link";
import { ArrowLeft, Factory, Settings2 } from "lucide-react";
import { useMe } from "@/lib/client/queries";
import { AdminOnly } from "@/components/config/admin-only";
import { LinesPanel } from "@/components/config/lines-panel";
import { StationsPanel } from "@/components/config/stations-panel";
import { OperatorsPanel } from "@/components/config/operators-panel";
import { InventoryItemsPanel } from "@/components/config/inventory-items-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConfigurationPage() {
  const { data: user } = useMe();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Settings2 className="h-6 w-6 text-primary" aria-hidden="true" />
            Shared configuration
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Manage manufacturing resources used by product routings. Product-specific BOMs,
            operations, instructions, mappings, and identifier ranges are edited from the product
            configuration page.
          </p>
        </div>
        <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          {user?.role ?? "Loading role…"}
        </span>
      </div>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Factory className="h-4 w-4 text-primary" aria-hidden="true" />
            Safe change control
          </CardTitle>
          <CardDescription>
            Configuration writes are ADMIN-only and are validated again on the server. Advisory
            conflicts are shown after a write, while the deterministic readiness engine remains
            the sole authority for READY, NOT READY, and BLOCKED decisions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminOnly what="shared configuration">
            <p className="text-sm text-foreground">
              You are viewing the live configuration catalog. Changes affect only future readiness
              checks; completed checks remain immutable.
            </p>
          </AdminOnly>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <LinesPanel />
        <StationsPanel />
        <OperatorsPanel />
        <InventoryItemsPanel />
      </div>
    </div>
  );
}
