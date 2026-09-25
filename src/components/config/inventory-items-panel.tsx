"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useInventoryItems } from "@/lib/client/queries";
import type { InventoryItemListItem, InventoryStatus } from "@/lib/client/types";
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
import { AdminOnly, useIsAdmin } from "@/components/config/admin-only";
import { ConfigStatusBadge } from "@/components/config/config-status-badge";
import { ConfigField, WriteDialog } from "@/components/config/write-dialog";

export function InventoryItemsPanel() {
  const items = useInventoryItems();
  const isAdmin = useIsAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItemListItem | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Inventory items</CardTitle>
          <CardDescription>
            Finished-goods and component inventory is shared across products. SKU is immutable after
            creation; deactivate an item instead of deleting mapped history.
          </CardDescription>
        </div>
        <AdminOnly what="inventory items">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add inventory item
          </Button>
        </AdminOnly>
      </CardHeader>
      <CardContent>
        {items.isLoading ? (
          <LoadingState label="Loading inventory items…" />
        ) : items.isError ? (
          <ErrorState
            title="Unable to load inventory items"
            description="The inventory catalog could not be fetched."
            onRetry={() => void items.refetch()}
          />
        ) : !items.data || items.data.length === 0 ? (
          <EmptyState
            title="No inventory items"
            description="Add the finished-goods item that will be mapped to a product."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Inventory items</caption>
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">SKU</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Mapped products</th>
                  {isAdmin ? <th scope="col" className="py-2 text-right font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.data.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs">{item.sku}</td>
                    <td className="py-2.5 pr-3">{item.name}</td>
                    <td className="py-2.5 pr-3"><ConfigStatusBadge status={item.status} /></td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {item.productMappings.length > 0 ? item.productMappings.map((mapping) => mapping.product.name).join(", ") : "—"}
                    </td>
                    {isAdmin ? (
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(item)}
                            aria-label={`Edit inventory item ${item.sku}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <CreateInventoryItemDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditInventoryItemDialog item={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </Card>
  );
}

function CreateInventoryItemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<InventoryStatus>("ACTIVE");
  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add inventory item"
      description="Use the canonical finished-goods or component SKU. It must be unique across the inventory catalog."
      submitLabel="Create inventory item"
      buildRequest={() => ({ path: "/api/inventory-items", method: "POST", body: { sku, name, status } })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="SKU" htmlFor="new-inventory-sku" error={fieldError("sku")}>
            <Input id="new-inventory-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SW-FG-001" required />
          </ConfigField>
          <ConfigField label="Name" htmlFor="new-inventory-name" error={fieldError("name")}>
            <Input id="new-inventory-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </ConfigField>
          <ConfigField label="Status" htmlFor="new-inventory-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as InventoryStatus)}>
              <SelectTrigger id="new-inventory-status"><SelectValue /></SelectTrigger>
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

function EditInventoryItemDialog({ item, onOpenChange }: { item: InventoryItemListItem | null; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<InventoryStatus>("ACTIVE");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (item && seededFor !== item.id) {
    setSeededFor(item.id);
    setName(item.name);
    setStatus(item.status);
  }

  return (
    <WriteDialog
      open={item !== null}
      onOpenChange={onOpenChange}
      title={item ? `Edit ${item.sku}` : "Edit inventory item"}
      description="SKU is immutable. Set an item INACTIVE to remove it from future readiness eligibility without deleting mappings."
      submitLabel="Save inventory item"
      buildRequest={() => ({ path: `/api/inventory-items/${item?.id}`, method: "PATCH", body: { name, status } })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="SKU" htmlFor="edit-inventory-sku" hint="Immutable">
            <Input id="edit-inventory-sku" value={item?.sku ?? ""} disabled />
          </ConfigField>
          <ConfigField label="Name" htmlFor="edit-inventory-name" error={fieldError("name")}>
            <Input id="edit-inventory-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </ConfigField>
          <ConfigField label="Status" htmlFor="edit-inventory-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as InventoryStatus)}>
              <SelectTrigger id="edit-inventory-status"><SelectValue /></SelectTrigger>
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
