import { describe, expect, it } from "vitest";
import { inventoryRule } from "@/modules/readiness/rules/inventory";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import {
  baseContext,
  inventoryItem,
  inventoryMapping,
} from "../helpers/readiness";

function find(results: ReadinessRuleResult[], code: string) {
  return results.find((r) => r.ruleCode === code);
}

describe("Rule 5 — Output Inventory Mapping", () => {
  it("returns PASS for an active output mapping with a matching SKU", async () => {
    const results = await inventoryRule.evaluate(baseContext());
    expect(find(results, "INVENTORY_MAPPING_OK")).toMatchObject({ status: "PASS" });
  });

  it("FAILs when the product has no output mapping", async () => {
    const results = await inventoryRule.evaluate(baseContext({ inventoryMappings: [] }));
    const result = find(results, "INVENTORY_MAPPING_EXISTS");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
      affectedEntityType: "Product",
    });
  });

  it("FAILs when the output mapping is not active", async () => {
    const results = await inventoryRule.evaluate(
      baseContext({ inventoryMappings: [inventoryMapping({ status: "INACTIVE" })] })
    );
    expect(find(results, "INVENTORY_MAPPING_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs when the mapped inventory item is inactive", async () => {
    const results = await inventoryRule.evaluate(
      baseContext({
        inventoryMappings: [inventoryMapping({ inventoryItem: inventoryItem({ status: "INACTIVE" }) })],
      })
    );
    expect(find(results, "INVENTORY_ITEM_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs when the mapped SKU does not match the product", async () => {
    const results = await inventoryRule.evaluate(
      baseContext({
        inventoryMappings: [inventoryMapping({ inventoryItem: inventoryItem({ sku: "WRONG-SKU" }) })],
      })
    );
    expect(find(results, "INVENTORY_SKU_MATCH")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when more than one active output mapping exists (Safety S3)", async () => {
    const results = await inventoryRule.evaluate(
      baseContext({
        inventoryMappings: [
          inventoryMapping({ id: "map_1" }),
          inventoryMapping({ id: "map_2" }),
        ],
      })
    );
    expect(find(results, "INVENTORY_SINGLE_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL) when the mapped inventory item record is missing", async () => {
    const results = await inventoryRule.evaluate(
      baseContext({
        inventoryMappings: [inventoryMapping({ inventoryItem: null })],
      })
    );
    expect(find(results, "INVENTORY_ITEM_EXISTS")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
  });
});