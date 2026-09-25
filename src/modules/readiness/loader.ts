import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultClient } from "@/lib/db/prisma";
import { ReadinessVerificationError } from "@/lib/errors";
import type {
  AssignmentWithOperator,
  BomWithItems,
  InventoryMappingWithItem,
  LineWithStations,
  ReadinessCheckInput,
  ReadinessContext,
  ReadinessContextLoader,
  RoutingWithOperations,
  StationWithLine,
} from "./types";

/**
 * Loads the full readiness context with batched, indexed queries inside a
 * single snapshot transaction, so every rule sees a consistent view.
 *
 * Fail-safe: any database error is rethrown as ReadinessVerificationError so
 * the engine can respond BLOCKED instead of assuming PASS.
 */
export class PrismaReadinessContextLoader implements ReadinessContextLoader {
  constructor(private readonly client: PrismaClient = defaultClient) {}

  async load(input: ReadinessCheckInput, asOf: Date): Promise<ReadinessContext> {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const [product, bomVersion, routing, line, identifierRanges, inventoryMappings, productBoms, productRoutings] =
            await Promise.all([
              tx.product.findUnique({ where: { id: input.productId } }),
              tx.bOMVersion.findUnique({
                where: { id: input.bomVersionId },
                include: { items: { orderBy: { componentName: "asc" } } },
              }),
              tx.routing.findUnique({
                where: { id: input.routingId },
                include: { operations: { orderBy: { sequence: "asc" } } },
              }),
              tx.line.findUnique({
                where: { id: input.lineId },
                include: { stations: true },
              }),
              tx.identifierRange.findMany({
                where: { productId: input.productId },
                orderBy: { startNumber: "asc" },
              }),
              tx.productInventoryMapping.findMany({
                where: { productId: input.productId },
                include: { inventoryItem: true },
              }),
              tx.bOMVersion.findMany({
                where: { productId: input.productId },
                select: { id: true, version: true, status: true },
              }),
              tx.routing.findMany({
                where: { productId: input.productId },
                select: { id: true, code: true, status: true },
              }),
            ]);

          const opStationIds = [
            ...new Set(
              (routing?.operations ?? [])
                .map((op) => op.stationId)
                .filter((id): id is string => id != null)
            ),
          ];
          const opIds = (routing?.operations ?? []).map((op) => op.id);
          const lineStationIds = (line?.stations ?? []).map((s) => s.id);
          const stationIds = [...new Set([...opStationIds, ...lineStationIds])];

          const [stations, operatorAssignments, workInstructions] =
            await Promise.all([
              stationIds.length > 0
                ? tx.station.findMany({ where: { id: { in: stationIds } } })
                : Promise.resolve<never[]>([]),
              stationIds.length > 0
                ? tx.operatorStationAssignment.findMany({
                    where: { stationId: { in: stationIds } },
                    include: { operator: true },
                  })
                : Promise.resolve<never[]>([]),
              opIds.length > 0
                ? tx.workInstruction.findMany({
                    where: { routingOperationId: { in: opIds } },
                    orderBy: [{ routingOperationId: "asc" }, { version: "desc" }],
                  })
                : Promise.resolve<never[]>([]),
            ]);

          // Resolve the line reference on each station (for messages only).
          const stationLineIds = [
            ...new Set(
              stations
                .map((s) => s.lineId)
                .filter((id): id is string => id != null)
            ),
          ];
          const lines =
            stationLineIds.length > 0
              ? await tx.line.findMany({ where: { id: { in: stationLineIds } } })
              : [];
          const lineById = new Map(lines.map((l) => [l.id, l]));

          const stationsWithLine: StationWithLine[] = stations.map((s) => ({
            ...s,
            line: s.lineId ? (lineById.get(s.lineId) ?? null) : null,
          }));
          const stationsById = new Map(
            stationsWithLine.map((s) => [s.id, s])
          );

          const routingWithOperations: RoutingWithOperations | null = routing
            ? {
                ...routing,
                operations: routing.operations.map((op) => ({
                  ...op,
                  station: op.stationId
                    ? (stationsById.get(op.stationId) ?? null)
                    : null,
                })),
              }
            : null;

          const operatorsById = new Map(
            operatorAssignments
              .map((a) => a.operator)
              .filter((o): o is NonNullable<typeof o> => o != null)
              .map((o) => [o.id, o])
          );

          const workInstructionsByOperation = new Map<
            string,
            (typeof workInstructions)[number][]
          >();
          for (const wi of workInstructions) {
            const list = workInstructionsByOperation.get(wi.routingOperationId) ?? [];
            list.push(wi);
            workInstructionsByOperation.set(wi.routingOperationId, list);
          }

          const bomWithItems = bomVersion
            ? ({ ...bomVersion } as BomWithItems)
            : null;
          const lineWithStations = line
            ? ({ ...line, stations: line.stations } as LineWithStations)
            : null;

          return {
            input,
            asOf,
            product: product ?? null,
            bomVersion: bomWithItems,
            routing: routingWithOperations,
            line: lineWithStations,
            stationsById,
            identifierRanges,
            inventoryMappings: inventoryMappings as InventoryMappingWithItem[],
            operatorAssignments: operatorAssignments as AssignmentWithOperator[],
            operatorsById,
            productBoms,
            productRoutings,
            workInstructionsByOperation,
          };
        },
        { timeout: 15_000 }
      );
    } catch (err) {
      if (err instanceof ReadinessVerificationError) throw err;
      // Never let a database failure become a silent PASS.
      throw new ReadinessVerificationError();
    }
  }
}