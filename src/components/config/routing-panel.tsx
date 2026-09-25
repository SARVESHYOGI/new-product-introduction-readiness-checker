"use client";

import { useState } from "react";
import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouting, useRoutings, useStations } from "@/lib/client/queries";
import type { RoutingDetail, StationListItem, VersionStatus } from "@/lib/client/types";
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
type RoutingOperation = RoutingDetail["operations"][number];

export function RoutingPanel({ productId }: { productId: string }) {
  const routings = useRoutings(productId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = routings.data?.find((routing) => routing.id === selectedId) ?? routings.data?.[0];
  const detail = useRouting(selected?.id ?? null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Routings &amp; operations</CardTitle>
          <CardDescription>
            Each required operation must have one valid station on the line selected for the
            readiness check. Sequence numbers are immutable after creation.
          </CardDescription>
        </div>
        <AdminOnly what="routings">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add routing
          </Button>
        </AdminOnly>
      </CardHeader>
      <CardContent className="space-y-5">
        {routings.isLoading ? (
          <LoadingState label="Loading routings…" />
        ) : routings.isError ? (
          <ErrorState
            title="Unable to load routings"
            description="The product's routing history could not be fetched."
            onRetry={() => void routings.refetch()}
          />
        ) : !routings.data || routings.data.length === 0 ? (
          <EmptyState
            title="No routings"
            description="Create a routing and add its operations before trying a readiness check."
          />
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Routing history
              </p>
              <div className="flex flex-wrap gap-2" role="list" aria-label="Routings">
                {routings.data.map((routing) => (
                  <Button
                    key={routing.id}
                    type="button"
                    size="sm"
                    variant={selected?.id === routing.id ? "default" : "outline"}
                    aria-pressed={selected?.id === routing.id}
                    onClick={() => setSelectedId(routing.id)}
                    className="h-auto min-h-10 flex-col items-start gap-1 px-3 py-2 text-left"
                  >
                    <span className="font-mono text-xs">{routing.code}</span>
                    <ConfigStatusBadge status={routing.status} />
                  </Button>
                ))}
              </div>
            </div>

            {detail.isLoading ? (
              <LoadingState label="Loading routing operations…" className="py-8" />
            ) : detail.isError || !detail.data ? (
              <ErrorState
                title="Unable to load routing details"
                description="The selected routing could not be fetched."
                onRetry={() => void detail.refetch()}
              />
            ) : (
              <RoutingEditor routing={detail.data} />
            )}
          </>
        )}
      </CardContent>

      <CreateRoutingDialog open={createOpen} onOpenChange={setCreateOpen} productId={productId} />
    </Card>
  );
}

function RoutingEditor({ routing }: { routing: RoutingDetail }) {
  const isReadOnly = routing.status === "OBSOLETE";
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingOperation, setEditingOperation] = useState<RoutingOperation | null>(null);

  return (
    <section aria-labelledby={`routing-${routing.id}-heading`} className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`routing-${routing.id}-heading`} className="font-semibold">
            <span className="font-mono text-sm">{routing.code}</span> · V{routing.version}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {routing.operations.length} operation{routing.operations.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfigStatusBadge status={routing.status} />
          {isReadOnly ? (
            <span className="text-xs text-muted-foreground">Read-only historical version</span>
          ) : (
            <AdminOnly what="routings">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit lifecycle
              </Button>
            </AdminOnly>
          )}
        </div>
      </div>

      {!isReadOnly ? (
        <AdminOnly what="routing operations">
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            Add operation
          </Button>
        </AdminOnly>
      ) : null}

      {routing.operations.length === 0 ? (
        <EmptyState
          title="No operations yet"
          description="A routing without operations cannot pass the routing readiness checks."
          className="py-8"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Operations in routing {routing.code}</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Seq.</th>
                <th scope="col" className="py-2 pr-3 font-medium">Operation</th>
                <th scope="col" className="py-2 pr-3 font-medium">Cycle time</th>
                <th scope="col" className="py-2 pr-3 font-medium">Station</th>
                <th scope="col" className="py-2 pr-3 font-medium">Required</th>
                {!isReadOnly ? <th scope="col" className="py-2 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {routing.operations.map((operation) => (
                <tr key={operation.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs">{operation.sequence}</td>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium">{operation.operationName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{operation.operationCode}</p>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                    {operation.standardCycleTimeSeconds === null ? "—" : `${operation.standardCycleTimeSeconds}s`}
                  </td>
                  <td className="py-2.5 pr-3">
                    {operation.station ? (
                      <span>
                        <span className="font-mono text-xs">{operation.station.code}</span>{" "}
                        <ConfigStatusBadge status={operation.station.status} />
                      </span>
                    ) : (
                      <span className="text-danger">Not assigned</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">{operation.required ? "Required" : "Optional"}</td>
                  {!isReadOnly ? (
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingOperation(operation)}
                          aria-label={`Edit operation ${operation.operationCode}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <RemoveRoutingOperationButton routingId={routing.id} operationId={operation.id} code={operation.operationCode} />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditRoutingDialog key={routing.id} open={editing} onOpenChange={setEditing} routing={routing} />
      <AddOperationDialog open={addOpen} onOpenChange={setAddOpen} routingId={routing.id} />
      <EditOperationDialog
        operation={editingOperation}
        routingId={routing.id}
        onOpenChange={(open) => !open && setEditingOperation(null)}
      />
    </section>
  );
}

function CreateRoutingDialog({
  open,
  onOpenChange,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
}) {
  const [code, setCode] = useState("");
  const [version, setVersion] = useState("1");
  const [status, setStatus] = useState<VersionStatus>("DRAFT");

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add routing"
      description="Start as DRAFT while operations are being assembled. A checked routing is superseded rather than deleted."
      submitLabel="Create routing"
      buildRequest={() => ({
        path: `/api/products/${productId}/routings`,
        method: "POST",
        body: { code, version, status },
        invalidate: [["routings", productId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Routing code" htmlFor="new-routing-code" error={fieldError("code")}>
              <Input id="new-routing-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ROUTE-102" required />
            </ConfigField>
            <ConfigField label="Version" htmlFor="new-routing-version" error={fieldError("version")}>
              <Input id="new-routing-version" value={version} onChange={(e) => setVersion(e.target.value)} required />
            </ConfigField>
          </div>
          <ConfigField label="Status" htmlFor="new-routing-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(value) => setStatus(value as VersionStatus)}>
              <SelectTrigger id="new-routing-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">DRAFT</SelectItem>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="OBSOLETE">OBSOLETE</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}

function EditRoutingDialog({
  open,
  onOpenChange,
  routing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routing: RoutingDetail;
}) {
  const [version, setVersion] = useState(routing.version);
  const [status, setStatus] = useState<VersionStatus>(routing.status);

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Lifecycle for ${routing.code}`}
      description="Routing code is immutable. Use OBSOLETE to preserve historical checks while preventing the version from being selected as current."
      submitLabel="Save lifecycle"
      buildRequest={() => ({
        path: `/api/routings/${routing.id}`,
        method: "PATCH",
        body: { version, status },
        invalidate: [["routing", routing.id], ["routings", routing.product.id]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Routing code" htmlFor="edit-routing-code" hint="Immutable">
            <Input id="edit-routing-code" value={routing.code} disabled />
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Version" htmlFor="edit-routing-version" error={fieldError("version")}>
              <Input id="edit-routing-version" value={version} onChange={(e) => setVersion(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Status" htmlFor="edit-routing-status" error={fieldError("status")}>
              <Select value={status} onValueChange={(value) => setStatus(value as VersionStatus)}>
                <SelectTrigger id="edit-routing-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="OBSOLETE">OBSOLETE</SelectItem>
                </SelectContent>
              </Select>
            </ConfigField>
          </div>
        </>
      )}
    </WriteDialog>
  );
}

function AddOperationDialog({
  open,
  onOpenChange,
  routingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routingId: string;
}) {
  const { data: stations } = useStations();
  const [sequence, setSequence] = useState("1");
  const [operationCode, setOperationCode] = useState("");
  const [operationName, setOperationName] = useState("");
  const [cycleTime, setCycleTime] = useState("");
  const [required, setRequired] = useState(true);
  const [stationId, setStationId] = useState(NONE);

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add routing operation"
      description="Required operations without a station or work instruction remain visible in the editor and will be reported by the deterministic readiness check."
      submitLabel="Add operation"
      buildRequest={() => ({
        path: `/api/routings/${routingId}/operations`,
        method: "POST",
        body: {
          sequence: Number(sequence),
          operationCode,
          operationName,
          standardCycleTimeSeconds: cycleTime ? Number(cycleTime) : null,
          required,
          stationId: stationId === NONE ? null : stationId,
        },
        invalidate: [["routing", routingId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Sequence" htmlFor="new-operation-sequence" error={fieldError("sequence")}>
              <Input id="new-operation-sequence" type="number" min="1" step="1" value={sequence} onChange={(e) => setSequence(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Operation code" htmlFor="new-operation-code" error={fieldError("operationCode")}>
              <Input id="new-operation-code" value={operationCode} onChange={(e) => setOperationCode(e.target.value)} placeholder="OP-010" required />
            </ConfigField>
          </div>
          <ConfigField label="Operation name" htmlFor="new-operation-name" error={fieldError("operationName")}>
            <Input id="new-operation-name" value={operationName} onChange={(e) => setOperationName(e.target.value)} placeholder="Display Installation" required />
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Standard cycle time (seconds)" htmlFor="new-operation-cycle" error={fieldError("standardCycleTimeSeconds")}>
              <Input id="new-operation-cycle" type="number" min="0" step="1" value={cycleTime} onChange={(e) => setCycleTime(e.target.value)} />
            </ConfigField>
            <ConfigField label="Station" htmlFor="new-operation-station" error={fieldError("stationId")}>
              <Select value={stationId} onValueChange={setStationId}>
                <SelectTrigger id="new-operation-station"><SelectValue placeholder="Select a station" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {(stations ?? []).map((station) => <StationOption key={station.id} station={station} />)}
                </SelectContent>
              </Select>
            </ConfigField>
          </div>
          <RequiredToggle checked={required} onChange={setRequired} id="new-operation-required" />
        </>
      )}
    </WriteDialog>
  );
}

function EditOperationDialog({
  operation,
  routingId,
  onOpenChange,
}: {
  operation: RoutingOperation | null;
  routingId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: stations } = useStations();
  const [operationCode, setOperationCode] = useState("");
  const [operationName, setOperationName] = useState("");
  const [cycleTime, setCycleTime] = useState("");
  const [required, setRequired] = useState(true);
  const [stationId, setStationId] = useState(NONE);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (operation && seededFor !== operation.id) {
    setSeededFor(operation.id);
    setOperationCode(operation.operationCode);
    setOperationName(operation.operationName);
    setCycleTime(operation.standardCycleTimeSeconds === null ? "" : String(operation.standardCycleTimeSeconds));
    setRequired(operation.required);
    setStationId(operation.stationId ?? NONE);
  }

  return (
    <WriteDialog
      open={operation !== null}
      onOpenChange={onOpenChange}
      title={operation ? `Edit ${operation.operationCode}` : "Edit routing operation"}
      description="Sequence is immutable. Changing the station or lifecycle state can change the next readiness result, but never changes a past one."
      submitLabel="Save operation"
      buildRequest={() => ({
        path: `/api/routings/${routingId}/operations/${operation?.id}`,
        method: "PATCH",
        body: {
          operationCode,
          operationName,
          standardCycleTimeSeconds: cycleTime ? Number(cycleTime) : null,
          required,
          stationId: stationId === NONE ? null : stationId,
        },
        invalidate: [["routing", routingId]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Sequence" htmlFor="edit-operation-sequence" hint="Immutable">
            <Input id="edit-operation-sequence" value={operation?.sequence ?? ""} disabled />
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Operation code" htmlFor="edit-operation-code" error={fieldError("operationCode")}>
              <Input id="edit-operation-code" value={operationCode} onChange={(e) => setOperationCode(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Operation name" htmlFor="edit-operation-name" error={fieldError("operationName")}>
              <Input id="edit-operation-name" value={operationName} onChange={(e) => setOperationName(e.target.value)} required />
            </ConfigField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Standard cycle time (seconds)" htmlFor="edit-operation-cycle" error={fieldError("standardCycleTimeSeconds")}>
              <Input id="edit-operation-cycle" type="number" min="0" step="1" value={cycleTime} onChange={(e) => setCycleTime(e.target.value)} />
            </ConfigField>
            <ConfigField label="Station" htmlFor="edit-operation-station" error={fieldError("stationId")}>
              <Select value={stationId} onValueChange={setStationId}>
                <SelectTrigger id="edit-operation-station"><SelectValue placeholder="Select a station" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {(stations ?? []).map((station) => <StationOption key={station.id} station={station} />)}
                </SelectContent>
              </Select>
            </ConfigField>
          </div>
          <RequiredToggle checked={required} onChange={setRequired} id="edit-operation-required" />
        </>
      )}
    </WriteDialog>
  );
}

function StationOption({ station }: { station: StationListItem }) {
  return <SelectItem value={station.id}>{station.code} — {station.name}{station.status !== "ACTIVE" ? ` (${station.status})` : ""}</SelectItem>;
}

function RemoveRoutingOperationButton({ routingId, operationId, code }: { routingId: string; operationId: string; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Remove operation ${code}`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${code}?`}
        description="This removes the operation from the routing. Past readiness results remain unchanged."
        submitLabel="Remove operation"
        variant="destructive"
        buildRequest={() => ({
          path: `/api/routings/${routingId}/operations/${operationId}`,
          method: "DELETE",
          invalidate: [["routing", routingId]],
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
