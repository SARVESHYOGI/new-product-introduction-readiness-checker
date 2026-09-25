"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouting, useRoutings, useWorkInstructions } from "@/lib/client/queries";
import type { RoutingDetail, VersionStatus, WorkInstructionListItem } from "@/lib/client/types";
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

export function WorkInstructionsPanel({ productId }: { productId: string }) {
  const routings = useRoutings(productId);
  const [selectedRoutingId, setSelectedRoutingId] = useState<string | null>(null);
  const selectedRouting = routings.data?.find((routing) => routing.id === selectedRoutingId) ?? routings.data?.[0];
  const routing = useRouting(selectedRouting?.id ?? null);
  const instructions = useWorkInstructions(productId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work instructions</CardTitle>
        <CardDescription>
          Every required routing operation needs a non-empty active instruction. Create a new
          version to change published content; active instructions are never deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {routings.isLoading || routing.isLoading ? (
          <LoadingState label="Loading operations and instructions…" />
        ) : routings.isError || !routings.data || routings.data.length === 0 ? (
          <EmptyState
            title="No routings to document"
            description="Create a routing and its operations first. Work instructions are attached to operations, not directly to a product."
          />
        ) : routing.isError || !routing.data ? (
          <ErrorState
            title="Unable to load routing operations"
            description="The selected routing could not be fetched."
            onRetry={() => void routing.refetch()}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Document routing:</span>
              <Select value={selectedRouting?.id ?? NONE} onValueChange={setSelectedRoutingId}>
                <SelectTrigger id="work-instruction-routing" className="w-full sm:w-80" aria-label="Routing to document">
                  <SelectValue placeholder="Select a routing" />
                </SelectTrigger>
                <SelectContent>
                  {routings.data.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.code} · V{item.version}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {instructions.isError ? (
              <ErrorState
                title="Unable to load work instructions"
                description="The instruction history could not be fetched."
                onRetry={() => void instructions.refetch()}
              />
            ) : instructions.isLoading ? (
              <LoadingState label="Loading work instructions…" className="py-8" />
            ) : (
              <InstructionOperationList
                operations={routing.data.operations}
                instructions={instructions.data ?? []}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InstructionOperationList({
  operations,
  instructions,
}: {
  operations: RoutingOperation[];
  instructions: WorkInstructionListItem[];
}) {
  const [editing, setEditing] = useState<WorkInstructionListItem | null>(null);

  if (operations.length === 0) {
    return (
      <EmptyState
        title="This routing has no operations"
        description="Add operations in the routing editor before creating work instructions."
      />
    );
  }

  return (
    <div className="space-y-4">
      {operations.map((operation) => {
        const versions = instructions.filter((item) => item.routingOperationId === operation.id);
        const activeVersions = versions.filter((item) => item.status === "ACTIVE");
        return (
          <section key={operation.id} className="rounded-lg border p-4" aria-labelledby={`operation-instructions-${operation.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id={`operation-instructions-${operation.id}`} className="font-semibold">
                  {operation.sequence}. {operation.operationName}
                </h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{operation.operationCode}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {operation.required ? <span className="text-xs font-medium text-danger">Required</span> : <span className="text-xs text-muted-foreground">Optional</span>}
                <AdminOnly what="work instructions">
                  <CreateInstructionDialog operation={operation} existingCount={versions.length} />
                </AdminOnly>
              </div>
            </div>

            {versions.length === 0 ? (
              <p className="mt-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
                No work instruction exists for this operation. A readiness check will fail here.
              </p>
            ) : (
              <ul className="mt-4 divide-y">
                {versions.map((instruction) => (
                  <li key={instruction.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{instruction.title}</p>
                        <span className="text-xs text-muted-foreground">v{instruction.version}</span>
                        <ConfigStatusBadge status={instruction.status} />
                        {instruction.status === "ACTIVE" ? (
                          <span className="text-xs font-medium text-success">Current published version</span>
                        ) : null}
                        {instruction.status === "ACTIVE" && !instruction.required ? (
                          <span className="text-xs font-medium text-danger">
                            Marked not required
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{instruction.content}</p>
                    </div>
                    <AdminOnly what="work instructions">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(instruction)}
                          aria-label={`Edit ${instruction.title}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        {instruction.status === "DRAFT" ? <DeleteInstructionButton instruction={instruction} /> : null}
                      </div>
                    </AdminOnly>
                  </li>
                ))}
              </ul>
            )}
            {activeVersions.length > 1 ? (
              <p className="mt-3 rounded-md border border-danger/30 bg-danger-soft p-2.5 text-xs font-medium text-danger">
                {activeVersions.length} versions are ACTIVE at once (v
                {activeVersions.map((v) => v.version).join(", v")}). Operators cannot be trained
                against an ambiguous instruction, so a readiness check will block production.
              </p>
            ) : null}
          </section>
        );
      })}
      <EditInstructionDialog
        instruction={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function CreateInstructionDialog({ operation, existingCount }: { operation: RoutingOperation; existingCount: number }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [required, setRequired] = useState(operation.required);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        New version
      </Button>
      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title={`New instruction for ${operation.operationName}`}
        description={
          existingCount > 0
            ? "This creates the next version. Publishing it (ACTIVE) automatically obsoletes the version it replaces, so operators always have exactly one current instruction."
            : "Create the first instruction for this operation."
        }
        submitLabel="Create instruction"
        buildRequest={() => ({
          path: `/api/routing-operations/${operation.id}/work-instructions`,
          method: "POST",
          body: { title, content, status, required },
          invalidate: [["work-instructions"]],
        })}
      >
        {({ fieldError }) => (
          <>
            <ConfigField label="Title" htmlFor={`new-instruction-title-${operation.id}`} error={fieldError("title")}>
              <Input id={`new-instruction-title-${operation.id}`} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </ConfigField>
            <ConfigField label="Content" htmlFor={`new-instruction-content-${operation.id}`} error={fieldError("content")} hint="Write the controlled work instruction an operator can follow at the station.">
              <textarea
                id={`new-instruction-content-${operation.id}`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={7}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                required
              />
            </ConfigField>
            <div className="grid gap-4 sm:grid-cols-2">
              <ConfigField
                label="Publish as"
                htmlFor={`new-instruction-status-${operation.id}`}
                hint={status === "ACTIVE" ? "Any current version is obsoleted automatically." : undefined}
                error={fieldError("status")}
              >
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as Extract<VersionStatus, "DRAFT" | "ACTIVE">)}
                >
                  <SelectTrigger id={`new-instruction-status-${operation.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">DRAFT — keep unpublished</SelectItem>
                    <SelectItem value="ACTIVE">ACTIVE — publish now</SelectItem>
                  </SelectContent>
                </Select>
              </ConfigField>
              <label htmlFor={`new-instruction-required-${operation.id}`} className="flex items-end gap-2 pb-2 text-sm">
                <input id={`new-instruction-required-${operation.id}`} type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 rounded border-input" />
                Required for production
              </label>
            </div>
          </>
        )}
      </WriteDialog>
    </>
  );
}

function EditInstructionDialog({
  instruction,
  onOpenChange,
}: {
  instruction: WorkInstructionListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<VersionStatus>("DRAFT");
  const [required, setRequired] = useState(true);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (instruction && seededFor !== instruction.id) {
    setSeededFor(instruction.id);
    setTitle(instruction.title);
    setContent(instruction.content);
    setStatus(instruction.status);
    setRequired(instruction.required);
  }

  // Lifecycle mirrors the service exactly, so the editor never offers an action
  // the API will reject:
  //   DRAFT    → editable, publishable, deletable
  //   ACTIVE   → published: content frozen, the only move is ACTIVE → OBSOLETE
  //   OBSOLETE → history: no further changes at all
  const isDraft = instruction?.status === "DRAFT";
  const isObsolete = instruction?.status === "OBSOLETE";
  const allowedStatuses: VersionStatus[] = isDraft
    ? ["DRAFT", "ACTIVE", "OBSOLETE"]
    : instruction?.status === "ACTIVE"
      ? ["ACTIVE", "OBSOLETE"]
      : ["OBSOLETE"];

  return (
    <WriteDialog
      open={instruction !== null}
      onOpenChange={onOpenChange}
      title={instruction ? `Edit instruction v${instruction.version}` : "Edit work instruction"}
      description={
        isObsolete
          ? "This version is obsoleted history. It cannot be changed or reactivated — create a new version instead."
          : instruction?.status === "ACTIVE"
            ? "Published content is frozen so the document operators were trained against cannot change silently. To change it, create a new version; here you can only retire this one."
            : "Drafts are freely editable. Publishing (ACTIVE) obsoletes the current version automatically."
      }
      submitLabel="Save instruction"
      buildRequest={() => ({
        path: `/api/work-instructions/${instruction?.id}`,
        method: "PATCH",
        body: isDraft ? { title, content, status, required } : { status },
        invalidate: [["work-instructions"]],
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField
            label="Title"
            htmlFor={`edit-instruction-title-${instruction?.id ?? "none"}`}
            hint={isDraft ? undefined : "Frozen"}
            error={isDraft ? fieldError("title") : undefined}
          >
            <Input
              id={`edit-instruction-title-${instruction?.id ?? "none"}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isDraft}
              required
            />
          </ConfigField>
          <ConfigField
            label="Content"
            htmlFor={`edit-instruction-content-${instruction?.id ?? "none"}`}
            hint={isDraft ? undefined : "Frozen"}
            error={isDraft ? fieldError("content") : undefined}
          >
            <textarea
              id={`edit-instruction-content-${instruction?.id ?? "none"}`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              disabled={!isDraft}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              required
            />
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Status" htmlFor={`edit-instruction-status-${instruction?.id ?? "none"}`} error={fieldError("status")}>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as VersionStatus)}
                disabled={isObsolete}
              >
                <SelectTrigger id={`edit-instruction-status-${instruction?.id ?? "none"}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowedStatuses.map((value) => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ConfigField>
            <label
              htmlFor={`edit-instruction-required-${instruction?.id ?? "none"}`}
              className={`flex items-end gap-2 pb-2 text-sm ${isDraft ? "" : "opacity-70"}`}
            >
              <input
                id={`edit-instruction-required-${instruction?.id ?? "none"}`}
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                disabled={!isDraft}
                className="h-4 w-4 rounded border-input"
              />
              Required for production
            </label>
          </div>
        </>
      )}
    </WriteDialog>
  );
}

function DeleteInstructionButton({ instruction }: { instruction: WorkInstructionListItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Delete draft instruction ${instruction.title}`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete draft instruction?"
        description="Only unpublished DRAFT instructions can be deleted. Published instructions must be marked OBSOLETE."
        submitLabel="Delete draft"
        variant="destructive"
        buildRequest={() => ({
          path: `/api/work-instructions/${instruction.id}`,
          method: "DELETE",
          invalidate: [["work-instructions"]],
        })}
      >
        {() => <p className="text-sm text-muted-foreground">This cannot be undone.</p>}
      </WriteDialog>
    </>
  );
}
