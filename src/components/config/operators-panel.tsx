"use client";

import { useState } from "react";
import { CalendarClock, Pencil, Trash2, UserPlus } from "lucide-react";
import { useOperators, useStations } from "@/lib/client/queries";
import type {
  OperatorAssignment,
  OperatorListItem,
  OperatorStatus,
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
import { ConfigStatusBadge } from "@/components/config/config-status-badge";
import { AdminOnly, useIsAdmin } from "@/components/config/admin-only";
import { ConfigField, WriteDialog } from "@/components/config/write-dialog";

const NONE = "__none__";

/** Default one-year validity window starting today, as `YYYY-MM-DD`. */
function defaultWindow(): { from: string; to: string } {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  return {
    from: today.toISOString().slice(0, 10),
    to: nextYear.toISOString().slice(0, 10),
  };
}

export function OperatorsPanel() {
  const { data: operators, isLoading, isError, refetch } = useOperators();
  const { data: stations } = useStations();
  const isAdmin = useIsAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<OperatorListItem | null>(null);
  const [assigningTo, setAssigningTo] = useState<OperatorListItem | null>(null);
  const [editingAssignment, setEditingAssignment] =
    useState<{ operatorId: string; assignment: OperatorAssignment } | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Operators &amp; station assignments</CardTitle>
          <CardDescription>
            An operator only counts as eligible when the assignment is ACTIVE and today falls
            inside its validity window. Expired assignments are never treated as valid.
          </CardDescription>
        </div>
        <AdminOnly what="operators">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add operator
          </Button>
        </AdminOnly>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label="Loading operators…" />
        ) : isError ? (
          <ErrorState
            title="Unable to load operators"
            description="The operator list could not be fetched."
            onRetry={() => void refetch()}
          />
        ) : !operators || operators.length === 0 ? (
          <EmptyState
            title="No operators"
            description="Add an operator and assign them to a station so readiness checks can verify staffing."
          />
        ) : (
          <ul className="space-y-3">
            {operators.map((operator) => (
              <li key={operator.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {operator.name}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {operator.employeeCode}
                      </span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <ConfigStatusBadge status={operator.status} />
                      {operator.activeAssignmentCount === 0 ? (
                        <span className="text-xs text-danger">
                          No currently valid assignment
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {operator.activeAssignmentCount} active assignment
                          {operator.activeAssignmentCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAssigningTo(operator)}
                      >
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                        Assign station
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(operator)}
                        aria-label={`Edit operator ${operator.employeeCode}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                {operator.assignments.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 border-t pt-3">
                    {operator.assignments.map((assignment) => {
                      const now = Date.now();
                      const inWindow =
                        new Date(assignment.validFrom).getTime() <= now &&
                        new Date(assignment.validTo).getTime() >= now;
                      const eligible = assignment.status === "ACTIVE" && inWindow;
                      return (
                        <li
                          key={assignment.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs">{assignment.stationCode}</span>
                            <span>{assignment.stationName}</span>
                            <span className="text-xs text-muted-foreground">
                              {assignment.validFrom.slice(0, 10)} →{" "}
                              {assignment.validTo.slice(0, 10)}
                            </span>
                            <ConfigStatusBadge status={assignment.status} />
                            {assignment.status === "ACTIVE" && !inWindow ? (
                              <span className="text-xs text-danger">Outside validity window</span>
                            ) : null}
                            {eligible ? (
                              <span className="text-xs text-success">Eligible now</span>
                            ) : null}
                          </span>
                          {isAdmin ? (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setEditingAssignment({ operatorId: operator.id, assignment })
                                }
                                aria-label={`Edit assignment to ${assignment.stationCode}`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <RemoveAssignmentButton
                                operatorId={operator.id}
                                assignmentId={assignment.id}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CreateOperatorDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditOperatorDialog
        operator={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <AddAssignmentDialog
        operator={assigningTo}
        stations={stations ?? []}
        onOpenChange={(open) => !open && setAssigningTo(null)}
      />
      <EditAssignmentDialog
        target={editingAssignment}
        onOpenChange={(open) => !open && setEditingAssignment(null)}
      />
    </Card>
  );
}

/** A delete with no confirmation would be one mis-click from data loss. */
function RemoveAssignmentButton({
  operatorId,
  assignmentId,
}: {
  operatorId: string;
  assignmentId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Remove station assignment"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <WriteDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove station assignment?"
        description="The operator will no longer be counted as eligible for this station. Past readiness results are unaffected."
        submitLabel="Remove assignment"
        variant="destructive"
        buildRequest={() => ({
          path: `/api/operators/${operatorId}/assignments/${assignmentId}`,
          method: "DELETE",
        })}
      >
        {() => <p className="text-sm text-muted-foreground">This cannot be undone.</p>}
      </WriteDialog>
    </>
  );
}

function CreateOperatorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");

  return (
    <WriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add operator"
      description="Employee code must be unique across the plant."
      submitLabel="Create operator"
      buildRequest={() => ({
        path: "/api/operators",
        method: "POST",
        body: { employeeCode, name, status: "ACTIVE" },
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Employee code" htmlFor="operator-code" error={fieldError("employeeCode")}>
            <Input
              id="operator-code"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="EMP-016"
              required
            />
          </ConfigField>
          <ConfigField label="Name" htmlFor="operator-name" error={fieldError("name")}>
            <Input
              id="operator-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Ellis"
              required
            />
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}

function EditOperatorDialog({
  operator,
  onOpenChange,
}: {
  operator: OperatorListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<OperatorStatus>("ACTIVE");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (operator && seededFor !== operator.id) {
    setSeededFor(operator.id);
    setName(operator.name);
    setStatus(operator.status);
  }

  return (
    <WriteDialog
      open={operator !== null}
      onOpenChange={onOpenChange}
      title={operator ? `Edit ${operator.employeeCode}` : "Edit operator"}
      description="Employee code is immutable. Setting an operator INACTIVE removes them from eligibility without deleting history."
      submitLabel="Save changes"
      buildRequest={() => ({
        path: `/api/operators/${operator?.id}`,
        method: "PATCH",
        body: { name, status },
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Employee code" htmlFor="edit-operator-code" hint="Immutable">
            <Input id="edit-operator-code" value={operator?.employeeCode ?? ""} disabled />
          </ConfigField>
          <ConfigField label="Name" htmlFor="edit-operator-name" error={fieldError("name")}>
            <Input
              id="edit-operator-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </ConfigField>
          <ConfigField label="Status" htmlFor="edit-operator-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(v) => setStatus(v as OperatorStatus)}>
              <SelectTrigger id="edit-operator-status">
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

function AddAssignmentDialog({
  operator,
  stations,
  onOpenChange,
}: {
  operator: OperatorListItem | null;
  stations: Array<{ id: string; code: string; name: string; status: string; lineId: string | null }>;
  onOpenChange: (open: boolean) => void;
}) {
  const initial = defaultWindow();
  const [stationId, setStationId] = useState(NONE);
  const [validFrom, setValidFrom] = useState(initial.from);
  const [validTo, setValidTo] = useState(initial.to);

  return (
    <WriteDialog
      open={operator !== null}
      onOpenChange={onOpenChange}
      title={operator ? `Assign ${operator.name} to a station` : "Assign station"}
      description="Assignments are validity windows, not permanent links. A new window is always created active; the readiness engine only counts it while today falls inside the window."
      submitLabel="Create assignment"
      buildRequest={() => ({
        path: `/api/operators/${operator?.id}/assignments`,
        method: "POST",
        body: { stationId, validFrom, validTo },
      })}
    >
      {({ fieldError }) => (
        <>
          <ConfigField label="Station" htmlFor="assignment-station" error={fieldError("stationId")}>
            <Select value={stationId} onValueChange={setStationId}>
              <SelectTrigger id="assignment-station">
                <SelectValue placeholder="Select a station" />
              </SelectTrigger>
              <SelectContent>
                {stations.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                    {s.status !== "ACTIVE" ? ` (${s.status})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ConfigField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Valid from" htmlFor="assignment-from" error={fieldError("validFrom")}>
              <Input
                id="assignment-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />
            </ConfigField>
            <ConfigField
              label="Valid to"
              htmlFor="assignment-to"
              hint="Inclusive — the assignment stays valid through this day."
              error={fieldError("validTo")}
            >
              <Input
                id="assignment-to"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                required
              />
            </ConfigField>
          </div>
        </>
      )}
    </WriteDialog>
  );
}

/**
 * Re-date or revoke an existing window.
 *
 * EXPIRED is deliberately absent: it is derived from `validTo`, so a window that
 * has already lapsed cannot be "un-expired" by editing a stored flag.
 */
function EditAssignmentDialog({
  target,
  onOpenChange,
}: {
  target: { operatorId: string; assignment: OperatorAssignment } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "REVOKED">("ACTIVE");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (target && seededFor !== target.assignment.id) {
    setSeededFor(target.assignment.id);
    setValidFrom(target.assignment.validFrom.slice(0, 10));
    setValidTo(target.assignment.validTo.slice(0, 10));
    setStatus(target.assignment.status === "REVOKED" ? "REVOKED" : "ACTIVE");
  }

  return (
    <WriteDialog
      open={target !== null}
      onOpenChange={onOpenChange}
      title={target ? `Edit assignment to ${target.assignment.stationCode}` : "Edit assignment"}
      description="Change the validity window, or revoke the assignment so it stops counting towards readiness. Station changes are made by removing and re-adding the assignment."
      submitLabel="Save assignment"
      buildRequest={() => ({
        path: `/api/operators/${target?.operatorId}/assignments/${target?.assignment.id}`,
        method: "PATCH",
        body: { validFrom, validTo, status },
      })}
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfigField label="Valid from" htmlFor="edit-assignment-from" error={fieldError("validFrom")}>
              <Input
                id="edit-assignment-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />
            </ConfigField>
            <ConfigField label="Valid to" htmlFor="edit-assignment-to" error={fieldError("validTo")}>
              <Input
                id="edit-assignment-to"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                required
              />
            </ConfigField>
          </div>
          <ConfigField label="Status" htmlFor="edit-assignment-status" error={fieldError("status")}>
            <Select value={status} onValueChange={(v) => setStatus(v as "ACTIVE" | "REVOKED")}>
              <SelectTrigger id="edit-assignment-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="REVOKED">REVOKED</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
        </>
      )}
    </WriteDialog>
  );
}
