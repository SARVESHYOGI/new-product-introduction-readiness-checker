"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useLines, useStations } from "@/lib/client/queries";
import type { StationListItem, StationStatus } from "@/lib/client/types";
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
import { ConfigStatusBadge } from "@/components/config/config-status-badge";
import { AdminOnly, useIsAdmin } from "@/components/config/admin-only";
import { ConfigField, WriteDialog } from "@/components/config/write-dialog";

const NONE = "__none__";

/** Parse the comma-separated capabilities input into the token list the API expects. */
function parseCapabilities(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function StationsPanel() {
  const { data: stations, isLoading, isError, refetch } = useStations();
  const { data: lines } = useLines(true);
  const isAdmin = useIsAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StationListItem | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Stations</CardTitle>
          <CardDescription>
            Stations are shared across routings. MAINTENANCE and INACTIVE stations are shown here
            because those are the states a readiness check must be able to block on.
          </CardDescription>
        </div>
        <AdminOnly what="stations">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add station
          </Button>
        </AdminOnly>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label="Loading stations…" />
        ) : isError ? (
          <ErrorState
            title="Unable to load stations"
            description="The station list could not be fetched."
            onRetry={() => void refetch()}
          />
        ) : !stations || stations.length === 0 ? (
          <EmptyState
            title="No stations"
            description="Add a station so routing operations can be assigned to a real place on a line."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Stations</caption>
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Code</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Line</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Capabilities</th>
                  {isAdmin ? (
                    <th scope="col" className="py-2 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => (
                  <tr key={station.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs">{station.code}</td>
                    <td className="py-2.5 pr-3">{station.name}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {station.line ? (
                        <>
                          <span className="font-mono text-xs">{station.line.code}</span>{" "}
                          {station.line.name}
                        </>
                      ) : (
                        <span className="text-danger">Not on a line</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <ConfigStatusBadge status={station.status} />
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {station.capabilities.length > 0
                        ? station.capabilities.join(", ")
                        : "—"}
                    </td>
                    {isAdmin ? (
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(station)}
                          aria-label={`Edit station ${station.code}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <CreateStationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lines={lines ?? []}
      />
      <EditStationDialog
        station={editing}
        lines={lines ?? []}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </Card>
  );
}

function CreateStationDialog({
  open,
  onOpenChange,
  lines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: Array<{ id: string; code: string; name: string; status: string }>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<StationStatus>("ACTIVE");
  const [lineId, setLineId] = useState(NONE);
  const [capabilities, setCapabilities] = useState("");

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add station"
      description="Stations belong to a production line and can be assigned to routing operations."
      submitLabel="Create station"
      buildRequest={() => ({
        path: "/api/stations",
        method: "POST",
        body: {
          code,
          name,
          status,
          lineId: lineId === NONE ? null : lineId,
          capabilities: parseCapabilities(capabilities),
        },
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Code" htmlFor="station-code" error={fieldError("code")}>
            <Input
              id="station-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ST-TEST-01"
              required
            />
          </ConfigField>
          <ConfigField label="Name" htmlFor="station-name" error={fieldError("name")}>
            <Input
              id="station-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Testing Station"
              required
            />
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Status" htmlFor="station-status" error={fieldError("status")}>
              <Select value={status} onValueChange={(v) => setStatus(v as StationStatus)}>
                <SelectTrigger id="station-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                  <SelectItem value="MAINTENANCE">MAINTENANCE</SelectItem>
                </SelectContent>
              </Select>
            </ConfigField>
            <ConfigField label="Production line" htmlFor="station-line" error={fieldError("lineId")}>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger id="station-line">
                  <SelectValue placeholder="Select a line" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ConfigField>
          </div>
          <ConfigField
            label="Capabilities"
            htmlFor="station-capabilities"
            error={fieldError("capabilities")}
            hint="Comma-separated, e.g. solder-paste, inspection"
          >
            <Input
              id="station-capabilities"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
              placeholder="inspection, torque-test"
            />
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}

function EditStationDialog({
  station,
  lines,
  onOpenChange,
}: {
  station: StationListItem | null;
  lines: Array<{ id: string; code: string; name: string; status: string }>;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<StationStatus>("ACTIVE");
  const [lineId, setLineId] = useState(NONE);
  const [capabilities, setCapabilities] = useState("");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (station && seededFor !== station.id) {
    setSeededFor(station.id);
    setName(station.name);
    setStatus(station.status);
    setLineId(station.lineId ?? NONE);
    setCapabilities(station.capabilities.join(", "));
  }

  return (
    <WriteDialog
      open={station !== null}
      onOpenChange={onOpenChange}
      title={station ? `Edit ${station.code}` : "Edit station"}
      description="Code is immutable. Changing status to INACTIVE or MAINTENANCE will block any readiness check that uses this station."
      submitLabel="Save changes"
      buildRequest={() => ({
        path: `/api/stations/${station?.id}`,
        method: "PATCH",
        body: {
          name,
          status,
          lineId: lineId === NONE ? null : lineId,
          capabilities: parseCapabilities(capabilities),
        },
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Code" htmlFor="edit-station-code" hint="Immutable">
            <Input id="edit-station-code" value={station?.code ?? ""} disabled />
          </ConfigField>
          <ConfigField label="Name" htmlFor="edit-station-name" error={fieldError("name")}>
            <Input
              id="edit-station-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Status" htmlFor="edit-station-status" error={fieldError("status")}>
              <Select value={status} onValueChange={(v) => setStatus(v as StationStatus)}>
                <SelectTrigger id="edit-station-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                  <SelectItem value="MAINTENANCE">MAINTENANCE</SelectItem>
                </SelectContent>
              </Select>
            </ConfigField>
            <ConfigField label="Production line" htmlFor="edit-station-line" error={fieldError("lineId")}>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger id="edit-station-line">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ConfigField>
          </div>
          <ConfigField
            label="Capabilities"
            htmlFor="edit-station-capabilities"
            error={fieldError("capabilities")}
            hint="Comma-separated"
          >
            <Input
              id="edit-station-capabilities"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
            />
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}
