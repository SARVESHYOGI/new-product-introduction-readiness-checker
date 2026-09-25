/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test fixtures for the deterministic readiness rules.
 *
 * The readiness rules are pure functions of the `ReadinessContext`, so unit
 * tests build in-memory contexts instead of hitting a database.
 */
import { Prisma } from "@/generated/prisma/client";
import type {
  AssignmentWithOperator,
  BomWithItems,
  InventoryMappingWithItem,
  LineWithStations,
  ReadinessCheckInput,
  ReadinessContext,
  RoutingWithOperations,
  StationWithLine,
} from "@/modules/readiness/types";

export const INPUT: ReadinessCheckInput = {
  productId: "prod_test",
  bomVersionId: "bom_test",
  routingId: "route_test",
  lineId: "line_test",
};

export const AS_OF = new Date("2025-06-01T12:00:00.000Z");

export function product(overrides: Record<string, unknown> = {}) {
  return {
    id: INPUT.productId,
    sku: "TST-1000",
    name: "Test Product",
    description: "Test product",
    status: "ACTIVE",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...(overrides as any),
  };
}

export function bom(overrides: Record<string, unknown> = {}): BomWithItems {
  return {
    id: INPUT.bomVersionId,
    productId: INPUT.productId,
    version: "1",
    status: "ACTIVE",
    effectiveFrom: new Date("2025-01-01T00:00:00Z"),
    effectiveTo: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    items: [],
    ...(overrides as any),
  };
}

export function bomItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "bi_1",
    bomVersionId: INPUT.bomVersionId,
    componentSku: "CMP-TEST",
    componentName: "Test Component",
    quantity: new Prisma.Decimal(1),
    unit: "pcs",
    isRequired: true,
    ...(overrides as any),
  };
}

export function line(overrides: Record<string, unknown> = {}): LineWithStations {
  return {
    id: INPUT.lineId,
    code: "LINE-TEST",
    name: "Test Line",
    status: "ACTIVE",
    stations: [],
    ...(overrides as any),
  };
}

export function station(overrides: Record<string, unknown> = {}): StationWithLine {
  return {
    id: "st_1",
    code: "ST-1",
    name: "Test Station",
    status: "ACTIVE",
    lineId: INPUT.lineId,
    capabilities: ["ASSEMBLY"],
    line: {
      id: INPUT.lineId,
      code: "LINE-TEST",
      name: "Test Line",
      status: "ACTIVE",
    },
    ...(overrides as any),
  };
}

export function routing(overrides: Record<string, unknown> = {}): RoutingWithOperations {
  return {
    id: INPUT.routingId,
    productId: INPUT.productId,
    code: "ROUTE-TEST",
    version: "1",
    status: "ACTIVE",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    operations: [],
    ...(overrides as any),
  };
}

export function operation(overrides: Record<string, unknown> = {}) {
  const st = station();
  const op = {
    id: "op_1",
    routingId: INPUT.routingId,
    sequence: 10,
    operationCode: "OP-1",
    operationName: "Test Operation",
    standardCycleTimeSeconds: 30,
    required: true,
    stationId: st.id,
    station: st,
    ...(overrides as any),
  };
  if (op.stationId) {
    op.station = op.station ?? station();
  } else {
    op.station = null;
  }
  return op;
}

export function workInstruction(overrides: Record<string, unknown> = {}) {
  return {
    id: "wi_1",
    routingOperationId: "op_1",
    title: "Test Work Instruction",
    content: "1. Do the thing.\n2. Verify it.",
    version: 1,
    status: "ACTIVE",
    required: true,
    ...(overrides as any),
  };
}

export function operator(overrides: Record<string, unknown> = {}) {
  return {
    id: "op_001",
    employeeCode: "OP-001",
    name: "Test Operator",
    status: "ACTIVE",
    ...(overrides as any),
  };
}

export function assignment(overrides: Record<string, unknown> = {}): AssignmentWithOperator {
  return {
    id: "asg_1",
    operatorId: "op_001",
    stationId: "st_1",
    validFrom: new Date("2025-01-01T00:00:00Z"),
    validTo: new Date("2030-12-31T23:59:59Z"),
    status: "ACTIVE",
    operator: operator(),
    ...(overrides as any),
  };
}

export function identifierRange(overrides: Record<string, unknown> = {}) {
  return {
    id: "ir_1",
    productId: INPUT.productId,
    prefix: "TST-",
    startNumber: 1000,
    endNumber: 99999,
    currentNumber: 1500,
    status: "ACTIVE",
    ...(overrides as any),
  };
}

export function inventoryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_1",
    sku: "TST-1000",
    name: "Test Product (Finished Goods)",
    status: "ACTIVE",
    ...(overrides as any),
  };
}

export function inventoryMapping(overrides: Record<string, unknown> = {}): InventoryMappingWithItem {
  return {
    id: "map_1",
    productId: INPUT.productId,
    inventoryItemId: "inv_1",
    mappingType: "OUTPUT",
    status: "ACTIVE",
    inventoryItem: inventoryItem(),
    ...(overrides as any),
  };
}

/**
 * A fully valid, ready context: every rule would return a single PASS.
 * Override any piece to exercise a specific failure path.
 */
export function baseContext(overrides: Partial<ReadinessContext> = {}): ReadinessContext {
  const st = station();
  const ops = [operation({ id: "op_1", sequence: 10, stationId: st.id, station: st })];

  return {
    input: INPUT,
    asOf: AS_OF,
    product: product(),
    bomVersion: bom({
      items: [bomItem(), bomItem({ id: "bi_2", componentSku: "CMP-TEST-2", componentName: "Test Component 2" })],
    }),
    routing: routing({ operations: ops }),
    line: line(),
    stationsById: new Map([[st.id, st]]),
    identifierRanges: [identifierRange()],
    inventoryMappings: [inventoryMapping()],
    operatorAssignments: [assignment({ stationId: st.id })],
    operatorsById: new Map([["op_001", operator()]]),
    productBoms: [{ id: INPUT.bomVersionId, version: "1", status: "ACTIVE" }],
    productRoutings: [{ id: INPUT.routingId, code: "ROUTE-TEST", status: "ACTIVE" }],
    workInstructionsByOperation: new Map([
      ["op_1", [workInstruction()]],
    ]),
    ...overrides,
  };
}