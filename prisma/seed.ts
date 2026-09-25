/**
 * NPI Readiness Checker — demo seed.
 *
 * Populates a complete demo environment with 5 deliberate readiness scenarios
 * plus one deliberately unconfigured product:
 *
 *  Product 1  Smart Watch X1        READY      100%   everything valid
 *  Product 2  Smart Watch X Lite    NOT_READY   71%   missing work instruction + missing operator
 *  Product 3  Control Unit 2000     NOT_READY   86%   missing operator assignments
 *  Product 4  Display Module 4000   BLOCKED      57%  inactive station
 *  Product 5  Power Supply 5000     BLOCKED      71%  conflicting configuration (2 active BOMs + overlapping ranges)
 *  Product 6  PlayStation 5         (no check)         unconfigured: no BOM version, no routing
 *
 * After creating the configuration, it runs the real readiness engine once per
 * configured product and persists the immutable checks, so the dashboard and
 * history are populated with authentic results produced by the same code path as
 * live runs. Product 6 is asserted to have produced no check at all — an
 * unconfigured product can never be reported ready.
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth/password";
import { createPgPoolConfig, resolveDatabaseUrl } from "../src/lib/db/config";
import { ReadinessEngine } from "../src/modules/readiness/engine";
import { PrismaReadinessContextLoader } from "../src/modules/readiness/loader";
import { persistReadinessCheck } from "../src/modules/readiness/persist";
import { logger } from "../src/lib/logging/logger";

const client = new PrismaClient({
  // Same explicit pool config the application uses, so the seed exercises the
  // exact TLS/connection path that production will.
  adapter: new PrismaPg(createPgPoolConfig(resolveDatabaseUrl())),
});

/**
 * Seeded product that exists in the catalog but is deliberately not configured
 * (no BOM version, no routing). Exported so tests assert the same invariant.
 */
const UNCONFIGURED_PRODUCT_ID = "prod_006";

async function wipe(): Promise<void> {
  await client.readinessResult.deleteMany();
  await client.readinessCheck.deleteMany();
  await client.auditLog.deleteMany();
  await client.session.deleteMany();
  await client.workInstruction.deleteMany();
  await client.routingOperation.deleteMany();
  await client.routing.deleteMany();
  await client.bOMItem.deleteMany();
  await client.bOMVersion.deleteMany();
  await client.operatorStationAssignment.deleteMany();
  await client.operator.deleteMany();
  await client.station.deleteMany();
  await client.productInventoryMapping.deleteMany();
  await client.inventoryItem.deleteMany();
  await client.identifierRange.deleteMany();
  await client.line.deleteMany();
  await client.product.deleteMany();
  await client.user.deleteMany();
}

async function seedCore(): Promise<void> {
  // ------------------------------------------------------------------ lines
  const lines = [
    { id: "line_01", code: "LINE-01", name: "Assembly Line 1", status: "ACTIVE" as const },
    { id: "line_02", code: "LINE-02", name: "Assembly Line 2", status: "ACTIVE" as const },
    { id: "line_03", code: "LINE-03", name: "Module Line", status: "ACTIVE" as const },
  ];
  await client.line.createMany({ data: lines });

  // ---------------------------------------------------------------- stations
  const stations = [
    { id: "st_101", code: "ST-101", name: "SMT Placement", status: "ACTIVE" as const, lineId: "line_01", capabilities: ["solder-paste", "placement", "reflow"] },
    { id: "st_102", code: "ST-102", name: "Optical Inspection", status: "ACTIVE" as const, lineId: "line_01", capabilities: ["optical-inspection"] },
    { id: "st_103", code: "ST-103", name: "Display Assembly", status: "ACTIVE" as const, lineId: "line_01", capabilities: ["display-assembly", "adhesive"] },
    { id: "st_104", code: "ST-104", name: "Calibration", status: "ACTIVE" as const, lineId: "line_01", capabilities: ["calibration"] },
    { id: "st_105", code: "ST-105", name: "Packaging", status: "ACTIVE" as const, lineId: "line_01", capabilities: ["packaging", "labeling"] },
    { id: "st_201", code: "ST-201", name: "Frame Assembly", status: "ACTIVE" as const, lineId: "line_02", capabilities: ["mechanical-assembly"] },
    { id: "st_202", code: "ST-202", name: "Motor Mount", status: "ACTIVE" as const, lineId: "line_02", capabilities: ["mechanical-assembly", "torque"] },
    { id: "st_203", code: "ST-203", name: "Testing Station", status: "INACTIVE" as const, lineId: "line_02", capabilities: ["functional-test"] },
    { id: "st_204", code: "ST-204", name: "Final Assembly", status: "ACTIVE" as const, lineId: "line_02", capabilities: ["assembly"] },
    { id: "st_205", code: "ST-205", name: "Burn-in", status: "ACTIVE" as const, lineId: "line_02", capabilities: ["burn-in", "aging"] },
    { id: "st_206", code: "ST-206", name: "Traceability Check", status: "ACTIVE" as const, lineId: "line_02", capabilities: ["traceability", "label"] },
    { id: "st_301", code: "ST-301", name: "Module Assembly", status: "ACTIVE" as const, lineId: "line_03", capabilities: ["module-assembly"] },
    { id: "st_302", code: "ST-302", name: "Quality Gate", status: "ACTIVE" as const, lineId: "line_03", capabilities: ["quality"] },
    { id: "st_303", code: "ST-303", name: "Burn-in Chamber", status: "MAINTENANCE" as const, lineId: "line_03", capabilities: ["burn-in"] },
    { id: "st_304", code: "ST-304", name: "Pack & Ship", status: "ACTIVE" as const, lineId: "line_03", capabilities: ["packaging", "shipping"] },
  ];
  await client.station.createMany({ data: stations });

  // --------------------------------------------------------------- operators
  const operators = [
    { id: "op_001", employeeCode: "OP-001", name: "Sophia Chen", status: "ACTIVE" as const },
    { id: "op_002", employeeCode: "OP-002", name: "Marcus Reid", status: "ACTIVE" as const },
    { id: "op_003", employeeCode: "OP-003", name: "Elena Ortiz", status: "ACTIVE" as const },
    { id: "op_004", employeeCode: "OP-004", name: "Jack Okafor", status: "ACTIVE" as const },
    { id: "op_005", employeeCode: "OP-005", name: "Priya Patel", status: "ACTIVE" as const },
    { id: "op_006", employeeCode: "OP-006", name: "Liam Novak", status: "ACTIVE" as const },
    { id: "op_007", employeeCode: "OP-007", name: "Chloe Dubois", status: "ACTIVE" as const },
    { id: "op_008", employeeCode: "OP-008", name: "Ethan Kim", status: "ACTIVE" as const },
    { id: "op_009", employeeCode: "OP-009", name: "Ava Torres", status: "ACTIVE" as const },
    { id: "op_010", employeeCode: "OP-010", name: "Noah Fischer", status: "ACTIVE" as const },
    { id: "op_011", employeeCode: "OP-011", name: "Mia Romano", status: "ACTIVE" as const },
    { id: "op_012", employeeCode: "OP-012", name: "Leo Martins", status: "ACTIVE" as const },
    { id: "op_013", employeeCode: "OP-013", name: "Ruby Nguyen", status: "ACTIVE" as const },
    { id: "op_014", employeeCode: "OP-014", name: "Omar Hassan", status: "INACTIVE" as const },
    { id: "op_015", employeeCode: "OP-015", name: "Zoe Williams", status: "ACTIVE" as const },
  ];
  await client.operator.createMany({ data: operators });

  // ------------------------------------------------------------- assignments
  const from = new Date("2024-01-01T00:00:00Z");
  const to = new Date("2030-12-31T23:59:59Z");
  const assignments = [
    { id: "asg_101", operatorId: "op_001", stationId: "st_101", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_102", operatorId: "op_002", stationId: "st_102", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_103", operatorId: "op_003", stationId: "st_103", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_104", operatorId: "op_004", stationId: "st_104", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_105", operatorId: "op_008", stationId: "st_105", validFrom: from, validTo: to, status: "ACTIVE" as const },
    // Expired assignment on the same station (safety realism; a valid one exists).
    { id: "asg_105b", operatorId: "op_009", stationId: "st_105", validFrom: new Date("2022-01-01T00:00:00Z"), validTo: new Date("2023-01-01T00:00:00Z"), status: "ACTIVE" as const },
    { id: "asg_204", operatorId: "op_010", stationId: "st_204", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_205", operatorId: "op_011", stationId: "st_205", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_206", operatorId: "op_012", stationId: "st_206", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_301", operatorId: "op_005", stationId: "st_301", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_302", operatorId: "op_006", stationId: "st_302", validFrom: from, validTo: to, status: "ACTIVE" as const },
    { id: "asg_304", operatorId: "op_007", stationId: "st_304", validFrom: from, validTo: to, status: "ACTIVE" as const },
  ];
  await client.operatorStationAssignment.createMany({ data: assignments });

  // ---------------------------------------------------------- inventory items
  const inventoryItems = [
    { id: "inv_swx1000", sku: "SWX-1000", name: "Smart Watch X1 (Finished Goods)", status: "ACTIVE" as const },
    { id: "inv_swx900", sku: "SWX-900", name: "Smart Watch X Lite (Finished Goods)", status: "ACTIVE" as const },
    { id: "inv_ctu", sku: "CTU-2000", name: "Control Unit 2000 (Finished Goods)", status: "ACTIVE" as const },
    { id: "inv_dpl", sku: "DPL-4000", name: "Display Module 4000 (Finished Goods)", status: "ACTIVE" as const },
    { id: "inv_ps", sku: "PS-5000", name: "Power Supply 5000 (Finished Goods)", status: "ACTIVE" as const },
  ];
  await client.inventoryItem.createMany({ data: inventoryItems });

  // ---------------------------------------------------------------- products
  const products = [
    { id: "prod_001", sku: "SWX-1000", name: "Smart Watch X1", description: "Flagship smart watch with AMOLED display.", status: "ACTIVE" as const },
    { id: "prod_002", sku: "SWX-900", name: "Smart Watch X Lite", description: "Entry-level smart watch.", status: "ACTIVE" as const },
    { id: "prod_003", sku: "CTU-2000", name: "Control Unit 2000", description: "Industrial control unit.", status: "ACTIVE" as const },
    { id: "prod_004", sku: "DPL-4000", name: "Display Module 4000", description: "Automotive display module.", status: "ACTIVE" as const },
    { id: "prod_005", sku: "PS-5000", name: "Power Supply 5000", description: "Switching power supply.", status: "ACTIVE" as const },
    // Deliberately UNCONFIGURED: exists in the catalog but has no BOM version,
    // no routing, no identifier range and no output inventory mapping. It
    // demonstrates that "the product exists" is not the same as "the product
    // is ready" — no readiness check can even be requested for it, so it can
    // never be reported READY.
    { id: "prod_006", sku: "PS5", name: "PlayStation 5", description: "Unconfigured product — no BOM version and no routing.", status: "ACTIVE" as const },
  ];
  await client.product.createMany({ data: products });

  // --------------------------------------------------------- inventory mapping
  await client.productInventoryMapping.createMany({
    data: [
      { id: "map_101", productId: "prod_001", inventoryItemId: "inv_swx1000", mappingType: "OUTPUT", status: "ACTIVE" as const },
      { id: "map_102", productId: "prod_002", inventoryItemId: "inv_swx900", mappingType: "OUTPUT", status: "ACTIVE" as const },
      { id: "map_103", productId: "prod_003", inventoryItemId: "inv_ctu", mappingType: "OUTPUT", status: "ACTIVE" as const },
      { id: "map_104", productId: "prod_004", inventoryItemId: "inv_dpl", mappingType: "OUTPUT", status: "ACTIVE" as const },
      { id: "map_105", productId: "prod_005", inventoryItemId: "inv_ps", mappingType: "OUTPUT", status: "ACTIVE" as const },
    ],
  });

  // -------------------------------------------------------- identifier ranges
  await client.identifierRange.createMany({
    data: [
      { id: "ir_101", productId: "prod_001", prefix: "SWX-", startNumber: 1000, endNumber: 99999, currentNumber: 1027, status: "ACTIVE" as const },
      { id: "ir_102", productId: "prod_002", prefix: "SWL-", startNumber: 5000, endNumber: 49999, currentNumber: 5133, status: "ACTIVE" as const },
      { id: "ir_103", productId: "prod_003", prefix: "CTU-", startNumber: 2000, endNumber: 99999, currentNumber: 2100, status: "ACTIVE" as const },
      { id: "ir_104", productId: "prod_004", prefix: "DPL-", startNumber: 4000, endNumber: 99999, currentNumber: 4102, status: "ACTIVE" as const },
      // Product 5 — two overlapping ACTIVE ranges (conflicting configuration).
      { id: "ir_105a", productId: "prod_005", prefix: "PS-", startNumber: 1000, endNumber: 99999, currentNumber: 1200, status: "ACTIVE" as const },
      { id: "ir_105b", productId: "prod_005", prefix: "PS-H-", startNumber: 9000, endNumber: 99999, currentNumber: 9100, status: "ACTIVE" as const },
    ],
  });

  // --------------------------------------------------------------------- BOMs
  await client.bOMVersion.createMany({
    data: [
      { id: "bom_101", productId: "prod_001", version: "3", status: "ACTIVE" as const, effectiveFrom: new Date("2025-01-01T00:00:00Z") },
      { id: "bom_102", productId: "prod_002", version: "2", status: "ACTIVE" as const, effectiveFrom: new Date("2025-02-01T00:00:00Z") },
      { id: "bom_103", productId: "prod_003", version: "1", status: "ACTIVE" as const, effectiveFrom: new Date("2025-03-01T00:00:00Z") },
      { id: "bom_104", productId: "prod_004", version: "1", status: "ACTIVE" as const, effectiveFrom: new Date("2025-04-01T00:00:00Z") },
      // Product 5 — two ACTIVE BOM versions on purpose (conflicting configuration).
      { id: "bom_105", productId: "prod_005", version: "1", status: "ACTIVE" as const, effectiveFrom: new Date("2025-05-01T00:00:00Z") },
      { id: "bom_106", productId: "prod_005", version: "2", status: "ACTIVE" as const, effectiveFrom: new Date("2025-06-01T00:00:00Z") },
    ],
  });

  await client.bOMItem.createMany({
    data: [
      // Product 1 — BOM V3
      { id: "bi_101", bomVersionId: "bom_101", componentSku: "SWX-CMP-DISPLAY", componentName: "Display", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_102", bomVersionId: "bom_101", componentSku: "SWX-CMP-MAIN", componentName: "Mainboard", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_103", bomVersionId: "bom_101", componentSku: "SWX-CMP-BATT", componentName: "Battery", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_104", bomVersionId: "bom_101", componentSku: "SWX-CMP-CASE", componentName: "Case", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_105", bomVersionId: "bom_101", componentSku: "SWX-CMP-STRAP", componentName: "Straps", quantity: 2, unit: "pcs", isRequired: true },
      { id: "bi_106", bomVersionId: "bom_101", componentSku: "SWX-CMP-SCREW", componentName: "Screws", quantity: 8, unit: "pcs", isRequired: true },
      // Product 2 — BOM V2
      { id: "bi_201", bomVersionId: "bom_102", componentSku: "SWX-CMP-DISPLAY", componentName: "Display", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_202", bomVersionId: "bom_102", componentSku: "SWX-CMP-MAIN", componentName: "Mainboard", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_203", bomVersionId: "bom_102", componentSku: "SWX-CMP-BATT", componentName: "Battery", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_204", bomVersionId: "bom_102", componentSku: "SWX-CMP-CASE", componentName: "Case", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_205", bomVersionId: "bom_102", componentSku: "SWX-CMP-STRAP", componentName: "Straps", quantity: 2, unit: "pcs", isRequired: true },
      // Product 3 — BOM V1
      { id: "bi_301", bomVersionId: "bom_103", componentSku: "CTU-CMP-PCB", componentName: "PCB", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_302", bomVersionId: "bom_103", componentSku: "CTU-CMP-RELAY", componentName: "Relay", quantity: 2, unit: "pcs", isRequired: true },
      { id: "bi_303", bomVersionId: "bom_103", componentSku: "CTU-CMP-ENCL", componentName: "Enclosure", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_304", bomVersionId: "bom_103", componentSku: "CTU-CMP-CONN", componentName: "Connectors", quantity: 4, unit: "pcs", isRequired: true },
      { id: "bi_305", bomVersionId: "bom_103", componentSku: "CTU-CMP-FW", componentName: "Firmware Module", quantity: 1, unit: "pcs", isRequired: true },
      // Product 4 — BOM V1
      { id: "bi_401", bomVersionId: "bom_104", componentSku: "DPL-CMP-PANEL", componentName: "Panel", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_402", bomVersionId: "bom_104", componentSku: "DPL-CMP-BL", componentName: "Backlight", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_403", bomVersionId: "bom_104", componentSku: "DPL-CMP-DRV", componentName: "Driver PCB", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_404", bomVersionId: "bom_104", componentSku: "DPL-CMP-FRM", componentName: "Frame", quantity: 1, unit: "pcs", isRequired: true },
      // Product 5 — BOM V1
      { id: "bi_501", bomVersionId: "bom_105", componentSku: "PS-CMP-TRANS", componentName: "Transformer", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_502", bomVersionId: "bom_105", componentSku: "PS-CMP-RECT", componentName: "Rectifier", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_503", bomVersionId: "bom_105", componentSku: "PS-CMP-CAP", componentName: "Capacitor Bank", quantity: 2, unit: "pcs", isRequired: true },
      { id: "bi_504", bomVersionId: "bom_105", componentSku: "PS-CMP-HOUS", componentName: "Housing", quantity: 1, unit: "pcs", isRequired: true },
      // Product 5 — BOM V2 (conflicting active version)
      { id: "bi_505", bomVersionId: "bom_106", componentSku: "PS-CMP-TRANS", componentName: "Transformer", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_506", bomVersionId: "bom_106", componentSku: "PS-CMP-RECT", componentName: "Rectifier", quantity: 1, unit: "pcs", isRequired: true },
      { id: "bi_507", bomVersionId: "bom_106", componentSku: "PS-CMP-CAP", componentName: "Capacitor Bank", quantity: 4, unit: "pcs", isRequired: true },
      { id: "bi_508", bomVersionId: "bom_106", componentSku: "PS-CMP-CONN", componentName: "Connectors", quantity: 4, unit: "pcs", isRequired: true },
    ],
  });

  // ------------------------------------------------------------------ routings
  await client.routing.createMany({
    data: [
      { id: "route_101", productId: "prod_001", code: "SWX-ROUTE", version: "3", status: "ACTIVE" as const },
      { id: "route_102", productId: "prod_002", code: "SWXL-ROUTE", version: "2", status: "ACTIVE" as const },
      { id: "route_103", productId: "prod_003", code: "CTU-ROUTE", version: "1", status: "ACTIVE" as const },
      { id: "route_104", productId: "prod_004", code: "DPL-ROUTE", version: "1", status: "ACTIVE" as const },
      { id: "route_105", productId: "prod_005", code: "PS-ROUTE", version: "1", status: "ACTIVE" as const },
    ],
  });

  await client.routingOperation.createMany({
    data: [
      // Product 1 — 5 operations, all stations valid + staffed
      { id: "op_0101", routingId: "route_101", sequence: 10, operationCode: "OP-0101", operationName: "SMT Placement", standardCycleTimeSeconds: 45, required: true, stationId: "st_101" },
      { id: "op_0102", routingId: "route_101", sequence: 20, operationCode: "OP-0102", operationName: "Optical Inspection", standardCycleTimeSeconds: 30, required: true, stationId: "st_102" },
      { id: "op_0103", routingId: "route_101", sequence: 30, operationCode: "OP-0103", operationName: "Display Installation", standardCycleTimeSeconds: 25, required: true, stationId: "st_103" },
      { id: "op_0104", routingId: "route_101", sequence: 40, operationCode: "OP-0104", operationName: "Calibration", standardCycleTimeSeconds: 20, required: true, stationId: "st_104" },
      { id: "op_0105", routingId: "route_101", sequence: 50, operationCode: "OP-0105", operationName: "Packaging", standardCycleTimeSeconds: 15, required: true, stationId: "st_105" },
      // Product 2 — 4 operations; op at st_205 missing WI, st_201/st_202 unstaffed
      { id: "op_0201", routingId: "route_102", sequence: 10, operationCode: "OP-0201", operationName: "Frame Assembly", standardCycleTimeSeconds: 40, required: true, stationId: "st_201" },
      { id: "op_0202", routingId: "route_102", sequence: 20, operationCode: "OP-0202", operationName: "Motor Mount", standardCycleTimeSeconds: 28, required: true, stationId: "st_202" },
      { id: "op_0203", routingId: "route_102", sequence: 30, operationCode: "OP-0203", operationName: "Final Assembly", standardCycleTimeSeconds: 30, required: true, stationId: "st_204" },
      { id: "op_0204", routingId: "route_102", sequence: 40, operationCode: "OP-0204", operationName: "Burn-in", standardCycleTimeSeconds: 55, required: true, stationId: "st_205" },
      // Product 3 — 4 operations; stations unstaffed
      { id: "op_0301", routingId: "route_103", sequence: 10, operationCode: "OP-0301", operationName: "Frame Assembly", standardCycleTimeSeconds: 35, required: true, stationId: "st_201" },
      { id: "op_0302", routingId: "route_103", sequence: 20, operationCode: "OP-0302", operationName: "Motor Mount", standardCycleTimeSeconds: 28, required: true, stationId: "st_202" },
      { id: "op_0303", routingId: "route_103", sequence: 30, operationCode: "OP-0303", operationName: "Solder Wave", standardCycleTimeSeconds: 40, required: true, stationId: "st_204" },
      { id: "op_0304", routingId: "route_103", sequence: 40, operationCode: "OP-0304", operationName: "Final Test", standardCycleTimeSeconds: 50, required: true, stationId: "st_205" },
      // Product 4 — Testing Station (st_203) is INACTIVE → blocked
      { id: "op_0401", routingId: "route_104", sequence: 10, operationCode: "OP-0401", operationName: "Functional Test", standardCycleTimeSeconds: 50, required: true, stationId: "st_203" },
      { id: "op_0402", routingId: "route_104", sequence: 20, operationCode: "OP-0402", operationName: "Final Assembly", standardCycleTimeSeconds: 30, required: true, stationId: "st_204" },
      { id: "op_0403", routingId: "route_104", sequence: 30, operationCode: "OP-0403", operationName: "Burn-in", standardCycleTimeSeconds: 55, required: true, stationId: "st_205" },
      { id: "op_0404", routingId: "route_104", sequence: 40, operationCode: "OP-0404", operationName: "Traceability Check", standardCycleTimeSeconds: 20, required: true, stationId: "st_206" },
      // Product 5 — 3 operations; only BOM/identifier conflicts block
      { id: "op_0501", routingId: "route_105", sequence: 10, operationCode: "OP-0501", operationName: "Module Assembly", standardCycleTimeSeconds: 45, required: true, stationId: "st_301" },
      { id: "op_0502", routingId: "route_105", sequence: 20, operationCode: "OP-0502", operationName: "Quality Gate", standardCycleTimeSeconds: 25, required: true, stationId: "st_302" },
      { id: "op_0503", routingId: "route_105", sequence: 30, operationCode: "OP-0503", operationName: "Pack & Ship", standardCycleTimeSeconds: 15, required: true, stationId: "st_304" },
    ],
  });

  // ------------------------------------------------------- work instructions
  const wi = (
    id: string,
    routingOperationId: string,
    title: string,
    content: string,
    version = 1,
    status: "ACTIVE" | "DRAFT" = "ACTIVE"
  ) => ({ id, routingOperationId, title, content, version, status, required: true });

  await client.workInstruction.createMany({
    data: [
      // Product 1
      wi("wi_101", "op_0101", "SMT Placement Work Instruction", "1. Verify stencil alignment.\n2. Load boards and components.\n3. Run reflow profile per spec SWX-RF-3.\n4. Record first-piece inspection."),
      wi("wi_102", "op_0102", "Optical Inspection Work Instruction", "1. Inspect solder joints per IPC-A-610.\n2. Flag bridging or missing components.\n3. Log inspection results in MES."),
      wi("wi_103", "op_0103", "Display Installation Work Instruction", "1. Apply adhesive to bezel.\n2. Seat display into bezel.\n3. Cure adhesive 60s.\n4. Verify no light leaks."),
      wi("wi_104", "op_0104", "Calibration Work Instruction", "1. Connect calibration rig.\n2. Run calibration routine CAL-104.\n3. Verify result within tolerance."),
      wi("wi_105", "op_0105", "Packaging Work Instruction", "1. Place device in tray.\n2. Add accessories per kit.\n3. Seal carton and apply label."),
      // Product 2 (op_0204 intentionally has NO work instruction)
      wi("wi_201", "op_0201", "Frame Assembly Work Instruction", "1. Assemble frame halves.\n2. Torque to spec 0.9 Nm.\n3. Visual check for gaps."),
      wi("wi_202", "op_0202", "Motor Mount Work Instruction", "1. Align motor bracket.\n2. Insert and torque screws to 1.2 Nm.\n3. Verify free rotation."),
      wi("wi_203", "op_0203", "Final Assembly Work Instruction", "1. Mate body to frame.\n2. Install cover plate.\n3. Run smoke test."),
      // Product 3
      wi("wi_301", "op_0301", "Frame Assembly Work Instruction", "1. Assemble frame halves.\n2. Torque to spec 0.9 Nm.\n3. Visual check for gaps."),
      wi("wi_302", "op_0302", "Motor Mount Work Instruction", "1. Align motor bracket.\n2. Insert and torque screws to 1.2 Nm.\n3. Verify free rotation."),
      wi("wi_303", "op_0303", "Solder Wave Work Instruction", "1. Preheat 100°C.\n2. Set conveyor speed.\n3. Inspect for bridges."),
      wi("wi_304", "op_0304", "Final Test Work Instruction", "1. Connect test fixture.\n2. Run full functional test.\n3. Record results."),
      // Product 4
      wi("wi_401", "op_0401", "Functional Test Work Instruction", "1. Power on unit.\n2. Execute functional test routine.\n3. Verify output signals."),
      wi("wi_402", "op_0402", "Final Assembly Work Instruction", "1. Assemble modules.\n2. Torque fasteners.\n3. Visual inspection."),
      wi("wi_403", "op_0403", "Burn-in Work Instruction", "1. Load units into burn-in racks.\n2. Run 12h cycle.\n3. Document readings."),
      wi("wi_404", "op_0404", "Traceability Check Work Instruction", "1. Scan serial label.\n2. Verify history links.\n3. Apply final label."),
      // Product 5
      wi("wi_501", "op_0501", "Module Assembly Work Instruction", "1. Mount transformer.\n2. Insert rectifier.\n3. Solder capacitor bank."),
      wi("wi_502", "op_0502", "Quality Gate Work Instruction", "1. Inspect per QG-02.\n2. Verify solder joints.\n3. Pass/fail decision."),
      wi("wi_503", "op_0503", "Pack & Ship Work Instruction", "1. Pack unit with foam.\n2. Apply shipping label.\n3. Load pallet."),
      // A newer DRAFT version exists for Product 5 op_0501 (informational only).
      wi("wi_504", "op_0501", "Module Assembly Work Instruction", "Draft: replace screw with push-fit connector.", 2, "DRAFT"),
    ],
  });

  // -------------------------------------------------------------------- users
  const users = [
    { id: "user_admin", email: "admin@npi.local", name: "Ava Admin", role: "ADMIN" as const, passwordHash: await hashPassword("admin123") },
    { id: "user_eng", email: "engineer@npi.local", name: "Eli Engineer", role: "ENGINEER" as const, passwordHash: await hashPassword("engineer123") },
    { id: "user_viewer", email: "viewer@npi.local", name: "Vera Viewer", role: "VIEWER" as const, passwordHash: await hashPassword("viewer123") },
  ];
  await client.user.createMany({ data: users });
}

/**
 * Run the real readiness engine for each demo product and persist the result.
 * This makes the dashboard/history populated with authentic checks and doubles
 * as an end-to-end smoke test of the engine against seeded data.
 */
async function seedReadinessHistory(): Promise<void> {
  const loader = new PrismaReadinessContextLoader(client);
  const engine = new ReadinessEngine(loader);

  const scenarios: Array<{
    productId: string;
    bomVersionId: string;
    routingId: string;
    lineId: string;
    expectedStatus: string;
    expectedScore: number;
  }> = [
    { productId: "prod_001", bomVersionId: "bom_101", routingId: "route_101", lineId: "line_01", expectedStatus: "READY", expectedScore: 100 },
    { productId: "prod_002", bomVersionId: "bom_102", routingId: "route_102", lineId: "line_02", expectedStatus: "NOT_READY", expectedScore: 71 },
    { productId: "prod_003", bomVersionId: "bom_103", routingId: "route_103", lineId: "line_02", expectedStatus: "NOT_READY", expectedScore: 86 },
    { productId: "prod_004", bomVersionId: "bom_104", routingId: "route_104", lineId: "line_02", expectedStatus: "BLOCKED", expectedScore: 57 },
    { productId: "prod_005", bomVersionId: "bom_105", routingId: "route_105", lineId: "line_03", expectedStatus: "BLOCKED", expectedScore: 71 },
  ];

  let failures = 0;
  for (const s of scenarios) {
    const startedAt = new Date();
    const outcome = await engine.run({
      productId: s.productId,
      bomVersionId: s.bomVersionId,
      routingId: s.routingId,
      lineId: s.lineId,
    });
    const completedAt = new Date();

    await persistReadinessCheck(
      client,
      {
        productId: s.productId,
        bomVersionId: s.bomVersionId,
        routingId: s.routingId,
        lineId: s.lineId,
      },
      outcome,
      null,
      startedAt,
      completedAt
    );

    const statusOk = outcome.status === s.expectedStatus;
    const scoreOk = outcome.score === s.expectedScore;
    if (!statusOk || !scoreOk) failures += 1;

    logger.info("seed_readiness_scenario", {
      productId: s.productId,
      expectedStatus: s.expectedStatus,
      status: outcome.status,
      expectedScore: s.expectedScore,
      score: outcome.score,
      statusOk,
      scoreOk,
      blockers: outcome.rootBlockers.length,
    });
  }

  if (failures > 0) {
    throw new Error(`${failures} seeded readiness scenario(s) did not match the expected outcome.`);
  }

  // prod_006 ("PlayStation 5") is seeded unconfigured on purpose. Assert the
  // fail-safe behaviour: it has no BOM/routing, so the service layer refuses to
  // run a check for it and no readiness result of any kind exists. It must
  // never carry a READY status.
  const [unconfiguredBoms, unconfiguredRoutings, unconfiguredChecks] = await Promise.all([
    client.bOMVersion.count({ where: { productId: UNCONFIGURED_PRODUCT_ID } }),
    client.routing.count({ where: { productId: UNCONFIGURED_PRODUCT_ID } }),
    client.readinessCheck.count({ where: { productId: UNCONFIGURED_PRODUCT_ID } }),
  ]);
  if (unconfiguredBoms > 0 || unconfiguredRoutings > 0 || unconfiguredChecks > 0) {
    throw new Error(
      `Unconfigured product ${UNCONFIGURED_PRODUCT_ID} must have no BOM, no routing and no readiness checks ` +
        `(found ${unconfiguredBoms} BOMs, ${unconfiguredRoutings} routings, ${unconfiguredChecks} checks).`
    );
  }
  logger.info("seed_unconfigured_product_verified", {
    productId: UNCONFIGURED_PRODUCT_ID,
    bomVersions: unconfiguredBoms,
    routings: unconfiguredRoutings,
    readinessChecks: unconfiguredChecks,
  });
}

async function main(): Promise<void> {
  logger.info("seed_start", {});
  await wipe();
  await seedCore();
  await seedReadinessHistory();
  logger.info("seed_complete", {});
}

/**
 * Run when executed directly (tsx prisma/seed.ts / prisma db seed) but not when
 * imported by tests, which reuse wipe/seedCore/seedReadinessHistory fixtures.
 */
const isMain = (() => {
  try {
    return (
      process.argv[1] !== undefined &&
      import.meta.url === pathToFileURL(process.argv[1]).href
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  main()
    .then(async () => {
      await client.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await client.$disconnect();
      process.exit(1);
    });
}

export { client, seedCore, seedReadinessHistory, wipe, UNCONFIGURED_PRODUCT_ID };