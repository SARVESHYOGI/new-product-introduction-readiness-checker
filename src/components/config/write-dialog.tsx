"use client";

import { useCallback, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { ApiClientError } from "@/lib/client/api";
import { useConfigWrite } from "@/lib/client/queries";
import type { AdvisoryConflict } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConflictNotice } from "@/components/config/conflict-notice";

export interface WriteResult {
  conflicts?: AdvisoryConflict[];
  [key: string]: unknown;
}

/**
 * A dialog bound to one configuration write endpoint.
 *
 * Every configuration form in the editor is the same shape — open, fill fields,
 * POST/PATCH, show either a validation error from the server or the advisory
 * conflicts the write returned. This component owns all of that, so an
 * individual form only has to describe its fields and how to build a request.
 *
 * Two behaviours worth noting:
 *
 *  1. **Server errors win over client errors.** `ApiClientError.details` carries
 *     the Zod issue list from `parseOrThrow`, so a server-side validation
 *     failure highlights the exact field rather than showing a generic banner.
 *  2. **Conflicts are shown, not swallowed.** When the write succeeds but the
 *     response carries `conflicts`, the dialog stays open so the engineer reads
 *     the warning instead of it disappearing on close.
 */
export function WriteDialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  submitLabel = "Save",
  variant = "default",
  buildRequest,
  onSuccess,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  submitLabel?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  buildRequest: () => {
    path: string;
    method: "POST" | "PATCH" | "DELETE";
    body?: unknown;
    invalidate?: readonly unknown[][];
  };
  onSuccess?: (result: WriteResult) => void;
  children: (state: {
    fieldError: (name: string) => string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
}) {
  const write = useConfigWrite<WriteResult>();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<AdvisoryConflict[]>([]);

  const reset = useCallback(() => {
    setFormError(null);
    setFieldErrors({});
    setConflicts([]);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setConflicts([]);

    try {
      const request = buildRequest();
      const response = await write.mutateAsync(request);
      const payload = (response ?? {}) as WriteResult;
      if (payload.conflicts && payload.conflicts.length > 0) {
        // Stay open so the warning is read rather than lost on close.
        setConflicts(payload.conflicts);
      } else {
        onSuccess?.(payload);
        onOpenChange(false);
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.message);
        if (Array.isArray(error.details)) {
          const mapped: Record<string, string> = {};
          for (const issue of error.details as Array<{ path?: string; message?: string }>) {
            if (issue.path && issue.message && !mapped[issue.path]) mapped[issue.path] = issue.message;
          }
          setFieldErrors(mapped);
        }
      } else {
        setFormError("Could not save the change. Try again.");
      }
    }
  };

  const fieldError = useCallback((name: string) => fieldErrors[name], [fieldErrors]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {children({ fieldError, invalid: Object.keys(fieldErrors).length > 0 })}

          {conflicts.length > 0 ? <ConflictNotice conflicts={conflicts} /> : null}

          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={write.isPending}
            >
              {conflicts.length > 0 ? "Close" : "Cancel"}
            </Button>
            <Button
              type="submit"
              variant={conflicts.length > 0 ? "outline" : variant}
              disabled={write.isPending}
            >
              {write.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {write.isPending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Standard field wrapper: label, control, and a linked error message. */
export function ConfigField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
