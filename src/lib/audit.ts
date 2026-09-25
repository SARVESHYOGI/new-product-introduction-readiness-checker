/**
 * Audit trail helper for configuration writes.
 *
 * Every administrative change records who did what to which record. The audit
 * metadata deliberately holds only identifiers and non-sensitive summary values
 * (codes, counts, status transitions) — never full document bodies, because
 * work-instruction content and operator data do not need to be duplicated into
 * an audit table to be traceable.
 */
import type { Prisma } from "@/generated/prisma/client";

export type AuditAction =
  | "product.create"
  | "product.update"
  | "bom.create"
  | "bom.update"
  | "bom.status_change"
  | "bom_item.create"
  | "bom_item.update"
  | "bom_item.delete"
  | "routing.create"
  | "routing.update"
  | "routing.status_change"
  | "routing_operation.create"
  | "routing_operation.update"
  | "routing_operation.delete"
  | "work_instruction.create"
  | "work_instruction.update"
  | "work_instruction.status_change"
  | "work_instruction.delete"
  | "line.create"
  | "line.update"
  | "station.create"
  | "station.update"
  | "operator.create"
  | "operator.update"
  | "assignment.create"
  | "assignment.update"
  | "assignment.status_change"
  | "assignment.delete"
  | "identifier_range.create"
  | "identifier_range.update"
  | "identifier_range.delete"
  | "inventory_item.create"
  | "inventory_item.update"
  | "inventory_mapping.create"
  | "inventory_mapping.update"
  | "inventory_mapping.delete";

export type AuditEntityType =
  | "Product"
  | "BOMVersion"
  | "BOMItem"
  | "Routing"
  | "RoutingOperation"
  | "WorkInstruction"
  | "Line"
  | "Station"
  | "Operator"
  | "OperatorStationAssignment"
  | "IdentifierRange"
  | "InventoryItem"
  | "ProductInventoryMapping";

/** Every caller writes inside a `$transaction`, so this is the transaction client. */
export type AuditWriter = Prisma.TransactionClient;

export async function recordAudit(
  tx: AuditWriter,
  entry: {
    actorId: string;
    action: AuditAction;
    entityType: AuditEntityType;
    entityId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      // Prisma's Json input type is narrower than `Record<string, unknown>`
      // (it rejects `undefined` values). Audit metadata is built by us from
      // known-safe primitives, so the cast is sound here.
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
