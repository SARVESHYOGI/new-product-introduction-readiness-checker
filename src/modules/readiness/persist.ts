import type { PrismaClient } from "@/generated/prisma/client";
import type { ReadinessCheckInput, ReadinessOutcome } from "./types";

/**
 * Persist a completed readiness outcome as an immutable check + results in a
 * single transaction. Shared by the API service and the seed script so demo
 * history is produced by the exact same code path as real checks.
 */
export async function persistReadinessCheck(
  client: PrismaClient,
  input: ReadinessCheckInput,
  outcome: ReadinessOutcome,
  actorId: string | null,
  startedAt: Date,
  completedAt: Date
) {
  return client.$transaction(async (tx) => {
    const created = await tx.readinessCheck.create({
      data: {
        productId: input.productId,
        bomVersionId: input.bomVersionId,
        routingId: input.routingId,
        lineId: input.lineId,
        status: outcome.status,
        score: outcome.score,
        passedCount: outcome.summary.passed,
        failedCount: outcome.summary.failed,
        warningCount: outcome.summary.warnings,
        blockingCount: outcome.summary.blocking,
        startedAt,
        completedAt,
        results: {
          create: outcome.checks.map((c) => ({
            ruleCode: c.ruleCode,
            category: c.category,
            status: c.status,
            severity: c.severity,
            title: c.title,
            message: c.message,
            affectedEntityType: c.affectedEntityType,
            affectedEntityId: c.affectedEntityId,
            causeRuleCode: c.causeRuleCode,
            remediation: c.remediation,
            isBlocking: c.isBlocking,
          })),
        },
      },
      include: { results: { orderBy: { createdAt: "asc" } } },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "readiness_check.run",
        entityType: "ReadinessCheck",
        entityId: created.id,
        metadata: { status: created.status, score: created.score },
      },
    });

    return created;
  });
}