"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { ProductListItem, ProductStatus } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminOnly } from "@/components/config/admin-only";
import { ConfigStatusBadge } from "@/components/config/config-status-badge";
import { ConfigField, WriteDialog } from "@/components/config/write-dialog";

export function ProductSettingsCard({ product }: { product: ProductListItem }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [status, setStatus] = useState<ProductStatus>(product.status);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Product settings</CardTitle>
          <CardDescription>
            Product identity is stable. Change the name, description, or lifecycle status without
            rewriting readiness history.
          </CardDescription>
        </div>
        <AdminOnly what="product settings">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Edit product
          </Button>
        </AdminOnly>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SKU</dt>
            <dd className="mt-1 font-mono text-sm">{product.sku}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lifecycle</dt>
            <dd className="mt-1"><ConfigStatusBadge status={product.status} /></dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{product.description || "No description"}</dd>
          </div>
        </dl>
      </CardContent>

      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit product settings"
        description="SKU cannot be changed after creation. Activating or deactivating a product does not bypass the configuration or safety rules."
        submitLabel="Save product"
        buildRequest={() => ({
          path: `/api/products/${product.id}`,
          method: "PATCH",
          body: { name, description: description || null, status },
          invalidate: [["product", product.id]],
        })}
      >
        {({ fieldError }) => (
          <>
            <ConfigField label="SKU" htmlFor="edit-product-sku" hint="Immutable">
              <Input id="edit-product-sku" value={product.sku} disabled />
            </ConfigField>
            <ConfigField label="Name" htmlFor="edit-product-name" error={fieldError("name")}>
              <Input id="edit-product-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Description" htmlFor="edit-product-description" error={fieldError("description")}>
              <Input id="edit-product-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </ConfigField>
            <ConfigField label="Status" htmlFor="edit-product-status" error={fieldError("status")}>
              <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
                <SelectTrigger id="edit-product-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                </SelectContent>
              </Select>
            </ConfigField>
          </>
        )}
      </WriteDialog>
    </Card>
  );
}
