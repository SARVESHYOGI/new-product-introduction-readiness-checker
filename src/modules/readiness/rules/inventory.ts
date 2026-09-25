import type {
  ReadinessContext,
  ReadinessRule,
  ReadinessRuleResult,
} from "../types";
import {
  buildResult,
  CRITICAL_BLOCK,
  HIGH_BLOCK,
  PASS_INFO,
} from "./helpers";

const CATEGORY = "Inventory Mapping";

/**
 * Rule 5 — Output Inventory Mapping
 *
 * Checks:
 *  1. Product has output inventory mapping
 *  2. Inventory item exists
 *  3. Inventory item is active
 *  4. SKU matches expected product
 *  5. There is exactly one active output mapping
 *
 * Safety (S3): more than one active output mapping would make the finished
 * goods inventory ambiguous → CRITICAL.
 */
export const inventoryRule: ReadinessRule = {
  code: "INVENTORY",
  category: CATEGORY,
  async evaluate(ctx: ReadinessContext): Promise<ReadinessRuleResult[]> {
    const results: ReadinessRuleResult[] = [];
    const mappings = ctx.inventoryMappings.filter((m) => m.mappingType === "OUTPUT");

    if (mappings.length === 0) {
      results.push(
        buildResult({
          ruleCode: "INVENTORY_MAPPING_EXISTS",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "Finished goods inventory item is not mapped",
          message: "Finished goods inventory item is not mapped.",
          affectedEntityType: "Product",
          affectedEntityId: ctx.input.productId,
          remediation:
            "Create an active OUTPUT inventory mapping for the product.",
        })
      );
      return results;
    }

    // Defensive: the (productId, mappingType) unique constraint allows at most
    // one row per product; this checks ACTIVE duplicates explicitly.
    const activeMappings = mappings.filter((m) => m.status === "ACTIVE");
    if (activeMappings.length > 1) {
      results.push(
        buildResult({
          ruleCode: "INVENTORY_SINGLE_ACTIVE",
          category: CATEGORY,
          status: "FAIL",
          ...CRITICAL_BLOCK,
          title: "Multiple active output mappings",
          message: `Product has ${activeMappings.length} active output inventory mappings. Exactly one is allowed.`,
          affectedEntityType: "Product",
          affectedEntityId: ctx.input.productId,
          remediation: "Deactivate all but one output inventory mapping.",
        })
      );
    }

    if (mappings.length > 1) {
      // Distinct rows (e.g. no longer unique mappingType) — treat as ambiguous.
      results.push(
        buildResult({
          ruleCode: "INVENTORY_SINGLE_ACTIVE",
          category: CATEGORY,
          status: "FAIL",
          ...CRITICAL_BLOCK,
          title: "Multiple output inventory mappings",
          message: `Product has ${mappings.length} output inventory mapping rows. Exactly one is expected.`,
          affectedEntityType: "Product",
          affectedEntityId: ctx.input.productId,
          remediation: "Consolidate to a single output inventory mapping.",
        })
      );
    }

    const mapping = mappings[0];
    if (!mapping) return results;

    if (mapping.status !== "ACTIVE") {
      results.push(
        buildResult({
          ruleCode: "INVENTORY_MAPPING_ACTIVE",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "Output mapping is not active",
          message: "The output inventory mapping is not active.",
          affectedEntityType: "ProductInventoryMapping",
          affectedEntityId: mapping.id,
          remediation: "Activate the output inventory mapping.",
        })
      );
    }

    if (!mapping.inventoryItem) {
      results.push(
        buildResult({
          ruleCode: "INVENTORY_ITEM_EXISTS",
          category: CATEGORY,
          status: "FAIL",
          ...CRITICAL_BLOCK,
          title: "Mapped inventory item no longer exists",
          message: "The mapped inventory item record no longer exists.",
          affectedEntityType: "ProductInventoryMapping",
          affectedEntityId: mapping.id,
          remediation: "Repair the inventory mapping to reference an existing item.",
        })
      );
    } else {
      if (mapping.inventoryItem.status !== "ACTIVE") {
        results.push(
          buildResult({
            ruleCode: "INVENTORY_ITEM_ACTIVE",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Inventory item is not active",
            message: `Inventory item ${mapping.inventoryItem.sku} is not active.`,
            affectedEntityType: "InventoryItem",
            affectedEntityId: mapping.inventoryItem.id,
            remediation: "Set the finished goods inventory item to ACTIVE.",
          })
        );
      }

      if (ctx.product && mapping.inventoryItem.sku !== ctx.product.sku) {
        results.push(
          buildResult({
            ruleCode: "INVENTORY_SKU_MATCH",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Mapped SKU does not match the product",
            message: `Mapped SKU ${mapping.inventoryItem.sku} does not match the product SKU ${ctx.product.sku}.`,
            affectedEntityType: "ProductInventoryMapping",
            affectedEntityId: mapping.id,
            remediation:
              "Point the output mapping at the finished goods SKU that matches the product.",
          })
        );
      }
    }

    if (results.length === 0) {
      results.push(
        buildResult({
          ruleCode: "INVENTORY_MAPPING_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "Output inventory mapping is valid",
          message: `Finished goods ${mapping.inventoryItem?.name ?? ""} is mapped and active.`,
        })
      );
    }

    return results;
  },
};