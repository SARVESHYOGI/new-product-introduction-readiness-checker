import { ApiError } from "@/lib/errors";

export type VersionStatus = "DRAFT" | "ACTIVE" | "OBSOLETE";

const LEGAL_TRANSITIONS: Record<VersionStatus, readonly VersionStatus[]> = {
  DRAFT: ["DRAFT", "ACTIVE", "OBSOLETE"],
  ACTIVE: ["ACTIVE", "OBSOLETE"],
  OBSOLETE: ["OBSOLETE"],
};

/**
 * Shared lifecycle policy for versioned configuration records (BOM versions,
 * routings, work instructions):
 *
 *   DRAFT    → DRAFT | ACTIVE | OBSOLETE   freely editable; publish or discard
 *   ACTIVE   → ACTIVE | OBSOLETE           published; the only legal move is
 *                                          superseding with OBSOLETE
 *   OBSOLETE → OBSOLETE                    permanent history; never reactivated
 *
 * `ACTIVE → DRAFT` is deliberately rejected: silently un-publishing a version
 * that operators may already be trained against would rewrite history with no
 * trace. Publishing and superseding must always be explicit transitions.
 */
export function assertVersionTransition(
  current: VersionStatus,
  next: VersionStatus,
  entityLabel: string
): void {
  if (current === next) return;
  if (!LEGAL_TRANSITIONS[current].includes(next)) {
    throw ApiError.conflict(
      "INVALID_STATUS_TRANSITION",
      `${entityLabel} cannot transition from ${current} to ${next}. Publish with DRAFT → ACTIVE or supersede with → OBSOLETE; an obsoleted version is permanent history.`
    );
  }
}