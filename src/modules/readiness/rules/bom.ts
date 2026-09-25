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
  WARN_LOW,
} from "./helpers";

const CATEGORY = "BOM";

/**
 * Rule 1 — BOM
 *
 * Checks:
 *  1. BOM exists
 *  2. BOM is active
 *  3. BOM belongs to selected product
 *  4. BOM has at least one required component
 *  5. Required components have valid quantity (> 0)
 *  6. No duplicate required component records
 *  7. No invalid component quantities
 *
 * Safety (Rule S3 — duplicate active configuration): more than one ACTIVE BOM
 * version for the selected product is a conflicting configuration and blocks
 * production.
 */
export const bomRule: ReadinessRule = {
  code: "BOM",
  category: CATEGORY,
  async evaluate(ctx: ReadinessContext): Promise<ReadinessRuleResult[]> {
    const results: ReadinessRuleResult[] = [];
    const bom = ctx.bomVersion;

    if (!bom) {
      results.push(
        buildResult({
          ruleCode: "BOM_EXISTS",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "BOM does not exist",
          message: "BOM does not exist for the selected configuration.",
          remediation: "Create and activate a BOM version for this product.",
        })
      );
      return results;
    }

    // Safety S3 — duplicate active configuration.
    const activeBoms = ctx.productBoms.filter((b) => b.status === "ACTIVE");
    if (activeBoms.length > 1) {
      results.push(
        buildResult({
          ruleCode: "BOM_ACTIVE_DUPLICATE",
          category: CATEGORY,
          status: "FAIL",
          ...CRITICAL_BLOCK,
          title: "Multiple active BOM versions",
          message: `Product ${ctx.product?.name ?? "product"} has ${activeBoms.length} active BOM versions (${activeBoms
            .map((b) => `V${b.version}`)
            .join(", ")}). Exactly one active BOM is allowed.`,
          affectedEntityType: "Product",
          affectedEntityId: ctx.input.productId,
          remediation:
            "Set all but one BOM version to OBSOLETE so exactly one active version remains.",
        })
      );
    }

    if (bom.productId !== ctx.input.productId) {
      results.push(
        buildResult({
          ruleCode: "BOM_PRODUCT_MATCH",
          category: CATEGORY,
          status: "FAIL",
          ...CRITICAL_BLOCK,
          title: "BOM does not belong to the selected product",
          message: `BOM V${bom.version} belongs to a different product than the one selected.`,
          affectedEntityType: "BOMVersion",
          affectedEntityId: bom.id,
          remediation: "Select a BOM version that belongs to the selected product.",
        })
      );
    }

    if (bom.status !== "ACTIVE") {
      results.push(
        buildResult({
          ruleCode: "BOM_ACTIVE",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "BOM is not active",
          message: `BOM exists but is not active (current status: ${bom.status}).`,
          affectedEntityType: "BOMVersion",
          affectedEntityId: bom.id,
          remediation: `Activate BOM V${bom.version} to make it eligible for production.`,
        })
      );
    }

    const requiredItems = bom.items.filter((item) => item.isRequired);
    if (requiredItems.length === 0) {
      results.push(
        buildResult({
          ruleCode: "BOM_REQUIRED_COMPONENTS",
          category: CATEGORY,
          status: "FAIL",
          ...HIGH_BLOCK,
          title: "BOM has no required components",
          message: "The BOM has no required components, so production cannot be verified.",
          affectedEntityType: "BOMVersion",
          affectedEntityId: bom.id,
          remediation: "Add at least one required component to the BOM.",
        })
      );
    }

    // Defensive duplicate check (a unique constraint protects this at the DB layer).
    const seen = new Set<string>();
    for (const item of requiredItems) {
      if (seen.has(item.componentSku)) {
        results.push(
          buildResult({
            ruleCode: "BOM_DUPLICATE_COMPONENT",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Duplicate required component record",
            message: `Component ${item.componentName} (${item.componentSku}) appears more than once as a required component.`,
            affectedEntityType: "BOMItem",
            affectedEntityId: item.id,
            remediation: "Remove the duplicate component record from the BOM.",
          })
        );
      }
      seen.add(item.componentSku);
    }

    for (const item of requiredItems) {
      if (item.quantity.lte(0)) {
        results.push(
          buildResult({
            ruleCode: "BOM_QUANTITY_VALID",
            category: CATEGORY,
            status: "FAIL",
            ...HIGH_BLOCK,
            title: "Invalid required component quantity",
            message: `Required component ${item.componentName} has quantity ${item.quantity}.`,
            affectedEntityType: "BOMItem",
            affectedEntityId: item.id,
            remediation: `Correct the quantity of ${item.componentName} to a positive value.`,
          })
        );
      }
    }

    for (const item of bom.items.filter((i) => !i.isRequired)) {
      if (item.quantity.lte(0)) {
        results.push(
          buildResult({
            ruleCode: "BOM_INVALID_QUANTITY",
            category: CATEGORY,
            status: "WARNING",
            ...WARN_LOW,
            title: "Non-required component has invalid quantity",
            message: `Non-required component ${item.componentName} has quantity ${item.quantity}.`,
            affectedEntityType: "BOMItem",
            affectedEntityId: item.id,
          })
        );
      }
    }

    if (results.length === 0) {
      results.push(
        buildResult({
          ruleCode: "BOM_OK",
          category: CATEGORY,
          status: "PASS",
          ...PASS_INFO,
          title: "BOM is active and valid",
          message: `Active BOM V${bom.version} exists with ${requiredItems.length} required component(s).`,
        })
      );
    }

    return results;
  },
};