"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useLines } from "@/lib/client/queries";
import type { LineListItem, LineStatus } from "@/lib/client/types";
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

export function LinesPanel() {
  const { data: lines, isLoading, isError, refetch } = useLines();
  const isAdmin = useIsAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LineListItem | null>(null);

  // Draft state for the create form.
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const table = (
    <table className="w-full text-sm">
      <caption className="sr-only">Production lines</caption>
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th scope="col" className="py-2 pr-3 font-medium">Code</th>
          <th scope="col" className="py-2 pr-3 font-medium">Name</th>
          <th scope="col" className="py-2 pr-3 font-medium">Status</th>
          <th scope="col" className="py-2 pr-3 font-medium">Stations</th>
          {isAdmin ? (
            <th scope="col" className="py-2 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {(lines ?? []).map((line) => (
          <tr key={line.id} className="border-b last:border-0">
            <td className="py-2.5 pr-3 font-mono text-xs">{line.code}</td>
            <td className="py-2.5 pr-3">{line.name}</td>
            <td className="py-2.5 pr-3">
              <ConfigStatusBadge status={line.status} />
            </td>
            <td className="py-2.5 pr-3 text-muted-foreground">{line.stationCount}</td>
            {isAdmin ? (
              <td className="py-2.5 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(line)}
                  aria-label={`Edit line ${line.code}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Production lines</CardTitle>
          <CardDescription>
            Lines are the physical production lines a readiness check can be run against.
          </CardDescription>
        </div>
        <AdminOnly what="lines">
          <Button size="sm" onClick={() => { setCode(""); setName(""); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add line
          </Button>
        </AdminOnly>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label="Loading lines…" />
        ) : isError ? (
          <ErrorState
            title="Unable to load lines"
            description="The production line list could not be fetched."
            onRetry={() => void refetch()}
          />
        ) : !lines || lines.length === 0 ? (
          <EmptyState
            title="No production lines"
            description="Add a line so routings can be checked against a real production line."
          />
        ) : (
          table
        )}
      </CardContent>

      <WriteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add production line"
        description="Lines are shared across every product. Code must be unique."
        submitLabel="Create line"
        buildRequest={() => ({
          path: "/api/lines",
          method: "POST",
          body: { code, name, status: "ACTIVE" },
        })}
      >
        {({ fieldError }) => (
          <>
            <ConfigField label="Code" htmlFor="line-code" error={fieldError("code")}>
              <Input
                id="line-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="LINE-04"
                required
              />
            </ConfigField>
            <ConfigField label="Name" htmlFor="line-name" error={fieldError("name")}>
              <Input
                id="line-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Battery Pack Line"
                required
              />
            </ConfigField>
          </>
        )}
      </WriteDialog>

      <EditLineDialog line={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </Card>
  );
}

function EditLineDialog({
  line,
  onOpenChange,
}: {
  line: LineListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<LineStatus>("ACTIVE");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Seed the form whenever a different row is opened.
  if (line && seededFor !== line.id) {
    setSeededFor(line.id);
    setName(line.name);
    setStatus(line.status);
  }

  return (
    <WriteDialog
      open={line !== null}
      onOpenChange={onOpenChange}
      title={line ? `Edit ${line.code}` : "Edit line"}
      description="Code is immutable — it identifies the line in routings and readiness history."
      submitLabel="Save changes"
      buildRequest={() => ({
        path: `/api/lines/${line?.id}`,
        method: "PATCH",
        body: { name, status },
        invalidate: [["lines"]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Code" htmlFor="edit-line-code" hint="Immutable">
            <Input id="edit-line-code" value={line?.code ?? ""} disabled />
          </ConfigField>
          <ConfigField label="Name" htmlFor="edit-line-name" error={fieldError("name")}>
            <Input id="edit-line-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </ConfigField>
          <ConfigField
            label="Status"
            htmlFor="edit-line-status"
            error={fieldError("status")}
            hint="INACTIVE lines cannot be selected for a new readiness check."
          >
            <Select value={status} onValueChange={(v) => setStatus(v as LineStatus)}>
              <SelectTrigger id="edit-line-status">
                <SelectValue />
              </SelectTrigger>
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
