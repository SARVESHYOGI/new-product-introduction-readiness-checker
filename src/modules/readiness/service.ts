import type { PrismaClient, ReadinessCheck, ReadinessResult } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import type { AuthUser } from "@/lib/auth/guard";
import { parseOrThrow, readinessCheckInputSchema } from "@/lib/validation/schemas";
import { PrismaReadinessContextLoader } from "./loader";
import {
  ReadinessEngine,
  S1_RULE_CODE,
  verificationFailure,
} from "./engine";
import { deriveRootBlockers } from "./dependency-analyzer";
import { buildOutcome } from "./scoring";
import { persistReadinessCheck } from "./persist";
import type { ReadinessCheckInput } from "./types";

export type CheckWithResults = ReadinessCheck & {
  results: ReadinessResult[];
  product?: { id: string; sku: string; name: string } | null;
  bomVersion?: { id: string; version: string } | null;
  routing?: { id: string; code: string } | null;
  line?: { id: string; code: string; name: string } | null;
};

const engine = new ReadinessEngine(new PrismaReadinessContextLoader());

export class ReadinessService {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  /**
   * Run a readiness check end-to-end:
   *  1. Validate input and ownership (IDs that do not belong together → 400)
   *  2. Execute the deterministic engine (fail-safe → BLOCKED on verification errors)
   *  3. Persist the check + immutable results + audit log in one transaction
   */
  async runCheck(input: unknown, actor: AuthUser): Promise<CheckWithResults> {
    const parsed = parseOrThrow(readinessCheckInputSchema, input);

    // Safety Rule 1 applies to the ownership preflight too: if the database
    // cannot be reached we must NOT skip validation and default to READY. A
    // genuine "these IDs do not belong together" answer is a 400 (the request
    // is invalid); anything else means the configuration could not be
    // verified, which is a fail-safe BLOCKED result.
    try {
      await this.validateConfiguration(parsed);
    } catch (err) {
      if (err instanceof ApiError) throw err;

      logger.error("readiness_preflight_failed", {
        productId: parsed.productId,
        bomVersionId: parsed.bomVersionId,
        routingId: parsed.routingId,
        lineId: parsed.lineId,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.persistFailSafe(parsed, actor.id);
    }

    const startedAt = new Date();
    const outcome = await engine.run(parsed);
    const completedAt = new Date();

    try {
      const check = await persistReadinessCheck(
        this.client,
        parsed,
        outcome,
        actor.id,
        startedAt,
        completedAt
      );

      logger.info("readiness_check_completed", {
        checkId: check.id,
        status: check.status,
        score: check.score,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      });

      return check;
    } catch (err) {
      logger.error("readiness_check_persist_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw ApiError.internal(
        "READINESS_CHECK_FAILED",
        "Unable to complete readiness validation."
      );
    }
  }

  /**
   * Persist the fail-safe outcome for a configuration that could not be
   * verified. The check is recorded as BLOCKED with the S1 safety result so
   * the decision is auditable and can never be read as READY.
   */
  private async persistFailSafe(
    parsed: ReadinessCheckInput,
    actorId: string
  ): Promise<CheckWithResults> {
    const startedAt = new Date();
    const outcome = buildOutcome([verificationFailure()], []);
    const completedAt = new Date();

    try {
      return await persistReadinessCheck(
        this.client,
        parsed,
        outcome,
        actorId,
        startedAt,
        completedAt
      );
    } catch {
      // The database is unavailable, so the fail-safe result cannot be
      // recorded. Still refuse to return READY.
      throw ApiError.internal(
        "READINESS_CHECK_FAILED",
        "Unable to complete readiness validation."
      );
    }
  }

  async getCheck(id: string): Promise<CheckWithResults | null> {
    return this.client.readinessCheck.findUnique({
      where: { id },
      include: {
        results: { orderBy: { createdAt: "asc" } },
        product: { select: { id: true, sku: true, name: true } },
        bomVersion: { select: { id: true, version: true } },
        routing: { select: { id: true, code: true } },
        line: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async getResults(checkId: string): Promise<ReadinessResult[]> {
    const check = await this.client.readinessCheck.findUnique({
      where: { id: checkId },
      select: { id: true },
    });
    if (!check) {
      throw ApiError.notFound("NOT_FOUND", "Readiness check was not found.");
    }
    return this.client.readinessResult.findMany({
      where: { readinessCheckId: checkId },
      orderBy: { createdAt: "asc" },
    });
  }

  async getHistory(productId: string, limit = 20): Promise<CheckWithResults[]> {
    return this.client.readinessCheck.findMany({
      where: { productId },
      include: {
        results: { orderBy: { createdAt: "asc" } },
        product: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Recent checks across all products (used by the global history page).
   */
  async listRecent(limit = 20): Promise<CheckWithResults[]> {
    return this.client.readinessCheck.findMany({
      include: {
        results: { orderBy: { createdAt: "asc" } },
        product: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Recompute root blockers from persisted results. Results are immutable, so
   * this is a pure derivation — it never rewrites history.
   */
  static deriveRootBlockers(results: ReadinessResult[]): ReturnType<typeof deriveRootBlockers> {
    return deriveRootBlockers(results);
  }

  static isVerificationBlocked(results: ReadinessResult[]): boolean {
    return results.some(
      (r) => r.status === "FAIL" && r.ruleCode === S1_RULE_CODE
    );
  }

  private async validateConfiguration(
    parsed: ReadinessCheckInput
  ): Promise<void> {
    const [product, bom, routing, line] = await Promise.all([
      this.client.product.findUnique({
        where: { id: parsed.productId },
        select: { id: true },
      }),
      this.client.bOMVersion.findUnique({
        where: { id: parsed.bomVersionId },
        select: { id: true, productId: true },
      }),
      this.client.routing.findUnique({
        where: { id: parsed.routingId },
        select: { id: true, productId: true },
      }),
      this.client.line.findUnique({
        where: { id: parsed.lineId },
        select: { id: true },
      }),
    ]);

    if (!product) {
      throw ApiError.badRequest("INVALID_PRODUCT", "The selected product does not exist.");
    }
    if (!bom) {
      throw ApiError.badRequest("INVALID_BOM", "The selected BOM version does not exist.");
    }
    if (!routing) {
      throw ApiError.badRequest("INVALID_ROUTING", "The selected routing does not exist.");
    }
    if (!line) {
      throw ApiError.badRequest("INVALID_LINE", "The selected production line does not exist.");
    }
    if (bom.productId !== product.id) {
      throw ApiError.badRequest(
        "MISMATCHED_CONFIGURATION",
        "The BOM version does not belong to the selected product."
      );
    }
    if (routing.productId !== product.id) {
      throw ApiError.badRequest(
        "MISMATCHED_CONFIGURATION",
        "The routing does not belong to the selected product."
      );
    }
  }
}