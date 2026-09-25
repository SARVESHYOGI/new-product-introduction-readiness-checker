"use client";

import { useState } from "react";
import { FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import { useBom, useBoms } from "@/lib/client/queries";
import type { BomDetail, BomItem, VersionStatus } from "@/lib/client/types";
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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { AdminOnly } from "@/components/config/admin-only";
import { ConfigStatusBadge } from "@/components/config/config-status-badge";
import { ConfigField, WriteDialog } from "@/components/config/write-dialog";

export function BomPanel({ productId }: { productId: string }) {
  const versions = useBoms(productId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = versions.data?.find((version) => version.id === selectedId) ?? versions.data?.[0];
  const detail = useBom(selected?.id ?? null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>BOM versions &amp; components</CardTitle>
          <CardDescription>
            Build a version as DRAFT, add required components, then activate it deliberately. A
            checked version is superseded rather than deleted.
          </CardDescription>
        </div>
        <AdminOnly what="BOM versions">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add BOM version
          </Button>
        </AdminOnly>
      </CardHeader>
      <CardContent className="space-y-5">
        {versions.isLoading ? (
          <LoadingState label="Loading BOM versions…" />
        ) : versions.isError ? (
          <ErrorState
            title="Unable to load BOM versions"
            description="The product's BOM history could not be fetched."
            onRetry={() => void versions.refetch()}
          />
        ) : !versions.data || versions.data.length === 0 ? (
          <EmptyState
            title="No BOM versions"
            description="Create a BOM version before adding the components required to build this product."
          />
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Version history
              </p>
              <div className="flex flex-wrap gap-2" role="list" aria-label="BOM versions">
                {versions.data.map((version) => (
                  <Button
                    key={version.id}
                    type="button"
                    size="sm"
                    variant={selected?.id === version.id ? "default" : "outline"}
                    aria-pressed={selected?.id === version.id}
                    onClick={() => setSelectedId(version.id)}
                    className="h-auto min-h-10 flex-col items-start gap-1 px-3 py-2 text-left"
                  >
                    <span>V{version.version}</span>
                    <ConfigStatusBadge status={version.status} />
                  </Button>
                ))}
              </div>
            </div>

            {detail.isLoading ? (
              <LoadingState label="Loading BOM components…" className="py-8" />
            ) : detail.isError || !detail.data ? (
              <ErrorState
                title="Unable to load BOM details"
                description="The selected BOM version could not be fetched."
                onRetry={() => void detail.refetch()}
              />
            ) : (
              <BomVersionEditor bom={detail.data} />
            )}
          </>
        )}
      </CardContent>

      <CreateBomVersionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        productId={productId}
      />
    </Card>
  );
}

function BomVersionEditor({ bom }: { bom: BomDetail }) {
  const isReadOnly = bom.status === "OBSOLETE";
  const [editing, setEditing] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);

  return (
    <section aria-labelledby={`bom-${bom.id}-heading`} className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`bom-${bom.id}-heading`} className="font-semibold">
            BOM V{bom.version}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {bom.items.length} component{bom.items.length === 1 ? "" : "s"} · created {new Date(bom.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfigStatusBadge status={bom.status} />
          {isReadOnly ? (
            <span className="text-xs text-muted-foreground">Read-only historical version</span>
          ) : (
            <AdminOnly what="BOM versions">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit lifecycle
              </Button>
            </AdminOnly>
          )}
        </div>
      </div>

      {!isReadOnly ? (
        <AdminOnly what="BOM components">
          <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Add component
          </Button>
        </AdminOnly>
      ) : null}

      {bom.items.length === 0 ? (
        <EmptyState
          title="No components yet"
          description="A BOM with no required components cannot pass the readiness BOM checks."
          className="py-8"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Components in BOM V{bom.version}</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">SKU</th>
                <th scope="col" className="py-2 pr-3 font-medium">Component</th>
                <th scope="col" className="py-2 pr-3 font-medium">Quantity</th>
                <th scope="col" className="py-2 pr-3 font-medium">Required</th>
                {!isReadOnly ? <th scope="col" className="py-2 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {bom.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs">{item.componentSku}</td>
                  <td className="py-2.5 pr-3">{item.componentName}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {String(item.quantity)} {item.unit}
                  </td>
                  <td className="py-2.5 pr-3">
                    {item.isRequired ? "Required" : "Optional"}
                  </td>
                  {!isReadOnly ? (
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingItem(item)}
                          aria-label={`Edit component ${item.componentSku}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <RemoveBomItemButton bomId={bom.id} itemId={item.id} sku={item.componentSku} />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditBomVersionDialog key={bom.id} open={editing} onOpenChange={setEditing} bom={bom} />
      <AddBomItemDialog open={addItemOpen} onOpenChange={setAddItemOpen} bomId={bom.id} />
      <EditBomItemDialog
        item={editingItem}
        bomId={bom.id}
        onOpenChange={(open) => !open && setEditingItem(null)}
      />
    </section>
  );
}

function CreateBomVersionDialog({
  open,
  onOpenChange,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
}) {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<VersionStatus>("DRAFT");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add BOM version"
      description="DRAFT is the safest starting point. Activation is deliberately explicit and may return advisory conflicts for empty or duplicate active versions."
      submitLabel="Create BOM version"
      buildRequest={() => ({
        path: `/api/products/${productId}/boms`,
        method: "POST",
        body: {
          version,
          status,
          effectiveFrom: effectiveFrom || null,
          effectiveTo: effectiveTo || null,
        },
        invalidate: [["boms", productId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Version" htmlFor="new-bom-version" error={fieldError("version")} hint="For example, 3 or 2.1">
            <Input id="new-bom-version" value={version} onChange={(e) => setVersion(e.target.value)} required />
          </ConfigField>
          <ConfigField label="Status" htmlFor="new-bom-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as VersionStatus)}>
              <SelectTrigger id="new-bom-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">DRAFT</SelectItem>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="OBSOLETE">OBSOLETE</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Effective from" htmlFor="new-bom-from" error={fieldError("effectiveFrom")}>
              <Input id="new-bom-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </ConfigField>
            <ConfigField label="Effective to" htmlFor="new-bom-to" error={fieldError("effectiveTo")}>
              <Input id="new-bom-to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </ConfigField>
          </div>
        </>
      )}
    </WriteDialog>
  );
}

function EditBomVersionDialog({
  open,
  onOpenChange,
  bom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bom: BomDetail;
}) {
  const [status, setStatus] = useState<VersionStatus>(bom.status);
  const [effectiveFrom, setEffectiveFrom] = useState(bom.effectiveFrom?.slice(0, 10) ?? "");
  const [effectiveTo, setEffectiveTo] = useState(bom.effectiveTo?.slice(0, 10) ?? "");

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Lifecycle for BOM V${bom.version}`}
      description="Use OBSOLETE to supersede a checked version. Readiness history remains immutable and readable."
      submitLabel="Save lifecycle"
      buildRequest={() => ({
        path: `/api/boms/${bom.id}`,
        method: "PATCH",
        body: {
          status,
          effectiveFrom: effectiveFrom || null,
          effectiveTo: effectiveTo || null,
        },
        invalidate: [["bom", bom.id], ["boms", bom.product.id]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Status" htmlFor="edit-bom-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as VersionStatus)}>
              <SelectTrigger id="edit-bom-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">DRAFT</SelectItem>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="OBSOLETE">OBSOLETE</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Effective from" htmlFor="edit-bom-from" error={fieldError("effectiveFrom")}>
              <Input id="edit-bom-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </ConfigField>
            <ConfigField label="Effective to" htmlFor="edit-bom-to" error={fieldError("effectiveTo")}>
              <Input id="edit-bom-to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </ConfigField>
          </div>
        </>
      )}
    </WriteDialog>
  );
}

function AddBomItemDialog({
  open,
  onOpenChange,
  bomId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bomId: string;
}) {
  const [componentSku, setComponentSku] = useState("");
  const [componentName, setComponentName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("EA");
  const [isRequired, setIsRequired] = useState(true);

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add BOM component"
      description="Required components must have a positive quantity. The readiness engine also checks for duplicate required component records."
      submitLabel="Add component"
      buildRequest={() => ({
        path: `/api/boms/${bomId}/items`,
        method: "POST",
        body: { componentSku, componentName, quantity, unit, isRequired },
        invalidate: [["bom", bomId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Component SKU" htmlFor="new-bom-item-sku" error={fieldError("componentSku")}>
              <Input id="new-bom-item-sku" value={componentSku} onChange={(e) => setComponentSku(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Component name" htmlFor="new-bom-item-name" error={fieldError("componentName")}>
              <Input id="new-bom-item-name" value={componentName} onChange={(e) => setComponentName(e.target.value)} required />
            </ConfigField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Quantity" htmlFor="new-bom-item-quantity" error={fieldError("quantity")}>
              <Input id="new-bom-item-quantity" type="number" min="0.0001" step="0.0001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Unit" htmlFor="new-bom-item-unit" error={fieldError("unit")}>
              <Input id="new-bom-item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </ConfigField>
          </div>
          <RequiredToggle checked={isRequired} onChange={setIsRequired} id="new-bom-item-required" />
        </>
      )}
    </WriteDialog>
  );
}

function EditBomItemDialog({
  item,
  bomId,
  onOpenChange,
}: {
  item: BomItem | null;
  bomId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [componentName, setComponentName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("EA");
  const [isRequired, setIsRequired] = useState(true);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (item && seededFor !== item.id) {
    setSeededFor(item.id);
    setComponentName(item.componentName);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setIsRequired(item.isRequired);
  }

  return (
    <WriteDialog
      open={item !== null}
      onOpenChange={onOpenChange}
      title={item ? `Edit ${item.componentSku}` : "Edit BOM component"}
      description="The component SKU is immutable after creation because it is the stable component reference."
      submitLabel="Save component"
      buildRequest={() => ({
        path: `/api/boms/${bomId}/items/${item?.id}`,
        method: "PATCH",
        body: { componentName, quantity, unit, isRequired },
        invalidate: [["bom", bomId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Component SKU" htmlFor="edit-bom-item-sku" hint="Immutable">
            <Input id="edit-bom-item-sku" value={item?.componentSku ?? ""} disabled />
          </ConfigField>
          <ConfigField label="Component name" htmlFor="edit-bom-item-name" error={fieldError("componentName")}>
            <Input id="edit-bom-item-name" value={componentName} onChange={(e) => setComponentName(e.target.value)} required />
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Quantity" htmlFor="edit-bom-item-quantity" error={fieldError("quantity")}>
              <Input id="edit-bom-item-quantity" type="number" min="0.0001" step="0.0001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Unit" htmlFor="edit-bom-item-unit" error={fieldError("unit")}>
              <Input id="edit-bom-item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </ConfigField>
          </div>
          <RequiredToggle checked={isRequired} onChange={setIsRequired} id="edit-bom-item-required" />
        </>
      )}
    </WriteDialog>
  );
}

function RemoveBomItemButton({ bomId, itemId, sku }: { bomId: string; itemId: string; sku: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Remove component ${sku}`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${sku}?`}
        description="This removes the component from this BOM version. Past readiness checks are not changed."
        submitLabel="Remove component"
        variant="destructive"
        buildRequest={() => ({
          path: `/api/boms/${bomId}/items/${itemId}`,
          method: "DELETE",
          invalidate: [["bom", bomId]],
        })}
      >
        {() => <p className="text-sm text-muted-foreground">This cannot be undone.</p>}
      </WriteDialog>
    </>
  );
}

function RequiredToggle({ checked, onChange, id }: { checked: boolean; onChange: (checked: boolean) => void; id: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-input" />
      Required for production
    </label>
  );
}
