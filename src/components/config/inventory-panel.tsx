"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useInventoryItems, useProductInventory } from "@/lib/client/queries";
import type {
  IdentifierRangeCreateInput,
  IdentifierRangeListItem,
  InventoryItemListItem,
  InventoryStatus,
  ProductInventoryConfig,
  RangeStatus,
} from "@/lib/client/types";
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

const NONE = "__none__";

type Mapping = ProductInventoryConfig["mappings"][number];
type InventoryItemOption = Pick<InventoryItemListItem, "id" | "sku" | "name" | "status">;

export function InventoryPanel({ productId }: { productId: string }) {
  const config = useProductInventory(productId);
  const items = useInventoryItems();
  const [rangeDialog, setRangeDialog] = useState<"create" | "edit" | null>(null);
  const [editingRange, setEditingRange] = useState<IdentifierRangeListItem | null>(null);
  const [mappingDialog, setMappingDialog] = useState<"create" | "edit" | null>(null);
  const [editingMapping, setEditingMapping] = useState<Mapping | null>(null);

  if (config.isLoading) return <LoadingState label="Loading inventory configuration…" />;
  if (config.isError || !config.data) {
    return (
      <ErrorState
        title="Unable to load inventory configuration"
        description="Output mappings and identifier ranges could not be fetched."
        onRetry={() => void config.refetch()}
      />
    );
  }

  const inventoryItems = items.data ?? [];
  const hasMapping = config.data.mappings.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Finished goods output mapping</CardTitle>
            <CardDescription>
              Exactly one OUTPUT mapping should point at the active finished-goods SKU for this
              product. SKU mismatches remain advisory until the deterministic check runs.
            </CardDescription>
          </div>
          <AdminOnly what="inventory mappings">
            {!hasMapping ? (
              <Button size="sm" onClick={() => setMappingDialog("create")}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add output mapping
              </Button>
            ) : null}
          </AdminOnly>
        </CardHeader>
        <CardContent>
          {config.data.mappings.length === 0 ? (
            <EmptyState
              title="No output mapping"
              description="Map the finished-goods inventory item before running a readiness check."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Finished goods output mappings</caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Inventory item</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                    <th scope="col" className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {config.data.mappings.map((mapping) => (
                    <tr key={mapping.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{mapping.inventoryItem.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{mapping.inventoryItem.sku}</p>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{mapping.mappingType}</td>
                      <td className="py-2.5 pr-3"><ConfigStatusBadge status={mapping.status} /></td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingMapping(mapping); setMappingDialog("edit"); }}
                            aria-label={`Edit output mapping ${mapping.inventoryItem.sku}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <RemoveMappingButton productId={productId} mapping={mapping} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {items.isError ? (
            <p className="mt-3 text-xs text-danger">Inventory items could not be loaded. Add or edit items in Configuration first.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Identifier ranges</CardTitle>
            <CardDescription>
              Active ranges for one product must never overlap, whatever their prefixes. The editor
              reports overlaps as advisories; the readiness engine blocks production on them.
            </CardDescription>
          </div>
          <AdminOnly what="identifier ranges">
            <Button size="sm" onClick={() => setRangeDialog("create")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add range
            </Button>
          </AdminOnly>
        </CardHeader>
        <CardContent>
          {config.data.ranges.length === 0 ? (
            <EmptyState
              title="No identifier range"
              description="Create a serial or lot-number range before running the identifier safety checks."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Identifier ranges</caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Prefix</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Start</th>
                    <th scope="col" className="py-2 pr-3 font-medium">End</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Current</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                    <th scope="col" className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {config.data.ranges.map((range) => (
                    <tr key={range.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-3 font-mono text-xs">{range.prefix}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{range.startNumber}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{range.endNumber}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{range.currentNumber}</td>
                      <td className="py-2.5 pr-3"><ConfigStatusBadge status={range.status} /></td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingRange(range); setRangeDialog("edit"); }}
                            aria-label={`Edit identifier range ${range.prefix}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <RemoveRangeButton range={range} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateRangeDialog
        open={rangeDialog === "create"}
        onOpenChange={(open) => !open && setRangeDialog(null)}
        productId={productId}
      />
      <EditRangeDialog
        open={rangeDialog === "edit"}
        onOpenChange={(open) => !open && setRangeDialog(null)}
        range={editingRange}
      />
      <CreateMappingDialog
        open={mappingDialog === "create"}
        onOpenChange={(open) => !open && setMappingDialog(null)}
        productId={productId}
        items={inventoryItems}
      />
      <EditMappingDialog
        open={mappingDialog === "edit"}
        onOpenChange={(open) => !open && setMappingDialog(null)}
        productId={productId}
        mapping={editingMapping}
        items={inventoryItems}
      />
    </div>
  );
}

function CreateMappingDialog({
  open,
  onOpenChange,
  productId,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  items: InventoryItemOption[];
}) {
  const [itemId, setItemId] = useState(NONE);
  const [status, setStatus] = useState<InventoryStatus>("ACTIVE");
  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Map finished goods inventory"
      description="Select the SKU that represents this product's finished goods. Inactive mappings are kept as history, so adding a second one is allowed but flagged."
      submitLabel="Create output mapping"
      buildRequest={() => ({
        path: `/api/products/${productId}/inventory/mappings`,
        method: "POST",
        body: { inventoryItemId: itemId, status },
        invalidate: [["product-inventory", productId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Inventory item" htmlFor="new-output-item" error={fieldError("inventoryItemId")}>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger id="new-output-item"><SelectValue placeholder="Select an inventory item" /></SelectTrigger>
              <SelectContent>
                {items.map((item) => <InventoryItemOptionItem key={item.id} item={item} />)}
              </SelectContent>
            </Select>
          </ConfigField>
          <ConfigField label="Mapping status" htmlFor="new-output-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as InventoryStatus)}>
              <SelectTrigger id="new-output-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="INACTIVE">INACTIVE</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}

function EditMappingDialog({
  open,
  onOpenChange,
  productId,
  mapping,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  mapping: Mapping | null;
  items: InventoryItemOption[];
}) {
  const [itemId, setItemId] = useState(NONE);
  const [status, setStatus] = useState<InventoryStatus>("ACTIVE");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (mapping && seededFor !== mapping.id) {
    setSeededFor(mapping.id);
    setItemId(mapping.inventoryItemId);
    setStatus(mapping.status);
  }

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit output mapping"
      description="Changing the inventory item or status affects only future readiness checks."
      submitLabel="Save mapping"
      buildRequest={() => ({
        path: `/api/products/${productId}/inventory/mappings/${mapping?.id}`,
        method: "PATCH",
        body: { inventoryItemId: itemId, status },
        invalidate: [["product-inventory", productId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Inventory item" htmlFor={`edit-output-item-${mapping?.id ?? "none"}`} error={fieldError("inventoryItemId")}>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger id={`edit-output-item-${mapping?.id ?? "none"}`}><SelectValue placeholder="Select an inventory item" /></SelectTrigger>
              <SelectContent>
                {items.map((item) => <InventoryItemOptionItem key={item.id} item={item} />)}
              </SelectContent>
            </Select>
          </ConfigField>
          <ConfigField label="Mapping status" htmlFor={`edit-output-status-${mapping?.id ?? "none"}`} error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as InventoryStatus)}>
              <SelectTrigger id={`edit-output-status-${mapping?.id ?? "none"}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="INACTIVE">INACTIVE</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}

function InventoryItemOptionItem({ item }: { item: InventoryItemOption }) {
  return <SelectItem value={item.id}>{item.sku} — {item.name}{item.status !== "ACTIVE" ? ` (${item.status})` : ""}</SelectItem>;
}

function CreateRangeDialog({
  open,
  onOpenChange,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
}) {
  const [prefix, setPrefix] = useState("");
  const [startNumber, setStartNumber] = useState("1000");
  const [endNumber, setEndNumber] = useState("1999");
  const [currentNumber, setCurrentNumber] = useState("1000");
  const [status, setStatus] = useState<RangeStatus>("ACTIVE");

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add identifier range"
      description="Start must be lower than end and current must sit inside the range. Overlaps are reported as advisories, not silently repaired."
      submitLabel="Create range"
      buildRequest={() => ({
        path: `/api/products/${productId}/inventory/ranges`,
        method: "POST",
        body: rangeBody({ prefix, startNumber, endNumber, currentNumber, status }),
        invalidate: [["product-inventory", productId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Prefix" htmlFor="new-range-prefix" error={fieldError("prefix")}>
            <Input id="new-range-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="SW" required />
          </ConfigField>
          <RangeNumberFields
            startNumber={startNumber}
            endNumber={endNumber}
            currentNumber={currentNumber}
            setStartNumber={setStartNumber}
            setEndNumber={setEndNumber}
            setCurrentNumber={setCurrentNumber}
            fieldError={fieldError}
            idPrefix="new-range"
          />
          <ConfigField label="Status" htmlFor="new-range-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as RangeStatus)}>
              <SelectTrigger id="new-range-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                <SelectItem value="EXHAUSTED">EXHAUSTED</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}

function EditRangeDialog({
  open,
  onOpenChange,
  range,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  range: IdentifierRangeListItem | null;
}) {
  const [prefix, setPrefix] = useState("");
  const [startNumber, setStartNumber] = useState("1000");
  const [endNumber, setEndNumber] = useState("1999");
  const [currentNumber, setCurrentNumber] = useState("1000");
  const [status, setStatus] = useState<RangeStatus>("ACTIVE");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (range && seededFor !== range.id) {
    setSeededFor(range.id);
    setPrefix(range.prefix);
    setStartNumber(String(range.startNumber));
    setEndNumber(String(range.endNumber));
    setCurrentNumber(String(range.currentNumber));
    setStatus(range.status);
  }

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={range ? `Edit range ${range.prefix}` : "Edit identifier range"}
      description="The current number can only move forward — lowering it would re-issue serials that already left the plant. Product ownership is fixed by the route."
      submitLabel="Save range"
      buildRequest={() => ({
        path: `/api/products/${range?.productId}/inventory/ranges/${range?.id}`,
        method: "PATCH",
        body: { prefix, startNumber: Number(startNumber), endNumber: Number(endNumber), currentNumber: Number(currentNumber), status },
        invalidate: [["product-inventory", range?.productId ?? ""]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Prefix" htmlFor="edit-range-prefix" error={fieldError("prefix")}>
            <Input id="edit-range-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} required />
          </ConfigField>
          <RangeNumberFields
            startNumber={startNumber}
            endNumber={endNumber}
            currentNumber={currentNumber}
            setStartNumber={setStartNumber}
            setEndNumber={setEndNumber}
            setCurrentNumber={setCurrentNumber}
            fieldError={fieldError}
            idPrefix="edit-range"
          />
          <ConfigField label="Status" htmlFor="edit-range-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as RangeStatus)}>
              <SelectTrigger id="edit-range-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                <SelectItem value="EXHAUSTED">EXHAUSTED</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}

function RangeNumberFields({
  startNumber,
  endNumber,
  currentNumber,
  setStartNumber,
  setEndNumber,
  setCurrentNumber,
  fieldError,
  idPrefix,
}: {
  startNumber: string;
  endNumber: string;
  currentNumber: string;
  setStartNumber: (value: string) => void;
  setEndNumber: (value: string) => void;
  setCurrentNumber: (value: string) => void;
  fieldError: (name: string) => string | undefined;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <ConfigField label="Start" htmlFor={`${idPrefix}-start`} error={fieldError("startNumber")}>
        <Input id={`${idPrefix}-start`} type="number" min="0" step="1" value={startNumber} onChange={(e) => setStartNumber(e.target.value)} required />
      </ConfigField>
      <ConfigField label="End" htmlFor={`${idPrefix}-end`} error={fieldError("endNumber")}>
        <Input id={`${idPrefix}-end`} type="number" min="0" step="1" value={endNumber} onChange={(e) => setEndNumber(e.target.value)} required />
      </ConfigField>
      <ConfigField label="Current" htmlFor={`${idPrefix}-current`} error={fieldError("currentNumber")}>
        <Input id={`${idPrefix}-current`} type="number" min="0" step="1" value={currentNumber} onChange={(e) => setCurrentNumber(e.target.value)} required />
      </ConfigField>
    </div>
  );
}

function rangeBody(input: {
  prefix: string;
  startNumber: number | string;
  endNumber: number | string;
  currentNumber: number | string;
  status: RangeStatus;
}): IdentifierRangeCreateInput {
  return {
    prefix: input.prefix,
    startNumber: Number(input.startNumber),
    endNumber: Number(input.endNumber),
    currentNumber: Number(input.currentNumber),
    status: input.status,
  };
}

function RemoveMappingButton({ productId, mapping }: { productId: string; mapping: Mapping }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Remove output mapping ${mapping.inventoryItem.sku}`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove output mapping?"
        description="The product will no longer have a finished-goods output mapping. A future readiness check will block until a valid mapping exists."
        submitLabel="Remove mapping"
        variant="destructive"
        buildRequest={() => ({ path: `/api/products/${productId}/inventory/mappings/${mapping.id}`, method: "DELETE", invalidate: [["product-inventory", productId]] })}
      >
        {() => <p className="text-sm text-muted-foreground">This cannot be undone.</p>}
      </WriteDialog>
    </>
  );
}

function RemoveRangeButton({ range }: { range: IdentifierRangeListItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Remove identifier range ${range.prefix}`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove range ${range.prefix}?`}
        description="This removes the range definition. Past readiness results are unchanged, and a future check will report the missing range."
        submitLabel="Remove range"
        variant="destructive"
        buildRequest={() => ({ path: `/api/products/${range.productId}/inventory/ranges/${range.id}`, method: "DELETE", invalidate: [["product-inventory", range.productId]] })}
      >
        {() => <p className="text-sm text-muted-foreground">This cannot be undone.</p>}
      </WriteDialog>
    </>
  );
}
