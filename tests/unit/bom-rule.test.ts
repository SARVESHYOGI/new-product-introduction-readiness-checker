import { describe, expect, it } from "vitest";
import { bomRule } from "@/modules/readiness/rules/bom";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import { Prisma } from "@/generated/prisma/client";
import {
  baseContext,
  bom,
  bomItem,
} from "../helpers/readiness";

function find(results: ReadinessRuleResult[], code: string) {
  return results.find((r) => r.ruleCode === code);
}

describe("Rule 1 — BOM", () => {
  it("returns a single PASS for an active BOM with valid required components", async () => {
    const ctx = baseContext();
    const results = await bomRule.evaluate(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ruleCode: "BOM_OK",
      category: "BOM",
      status: "PASS",
      isBlocking: false,
    });
  });

  it("FAILs when the BOM does not exist", async () => {
    const results = await bomRule.evaluate(baseContext({ bomVersion: null }));
    const result = find(results, "BOM_EXISTS");
    expect(result).toMatchObject({ status: "FAIL", severity: "HIGH", isBlocking: true });
  });

  it("FAILs when the BOM is not active", async () => {
    const results = await bomRule.evaluate(
      baseContext({ bomVersion: bom({ status: "DRAFT", items: [bomItem()] }) })
    );
    const result = find(results, "BOM_ACTIVE");
    expect(result).toMatchObject({ status: "FAIL", severity: "HIGH", isBlocking: true });
  });

  it("FAILs (CRITICAL) when the BOM does not belong to the selected product", async () => {
    const results = await bomRule.evaluate(
      baseContext({ bomVersion: bom({ productId: "prod_other", items: [bomItem()] }) })
    );
    const result = find(results, "BOM_PRODUCT_MATCH");
    expect(result).toMatchObject({ status: "FAIL", severity: "CRITICAL", isBlocking: true });
  });

  it("FAILs when the BOM has no required components", async () => {
    const results = await bomRule.evaluate(
      baseContext({ bomVersion: bom({ items: [bomItem({ isRequired: false })] }) })
    );
    const result = find(results, "BOM_REQUIRED_COMPONENTS");
    expect(result).toMatchObject({ status: "FAIL", severity: "HIGH", isBlocking: true });
  });

  it("FAILs when a required component has quantity 0", async () => {
    const results = await bomRule.evaluate(
      baseContext({
        bomVersion: bom({
          items: [bomItem({ quantity: new Prisma.Decimal(0) })],
        }),
      })
    );
    const result = find(results, "BOM_QUANTITY_VALID");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
      affectedEntityType: "BOMItem",
    });
    expect(result?.message).toContain("quantity 0");
  });

  it("FAILs when the same required component appears twice", async () => {
    const results = await bomRule.evaluate(
      baseContext({
        bomVersion: bom({
          items: [
            bomItem({ id: "bi_1", componentSku: "DUP" }),
            bomItem({ id: "bi_2", componentSku: "DUP" }),
          ],
        }),
      })
    );
    const result = find(results, "BOM_DUPLICATE_COMPONENT");
    expect(result).toMatchObject({ status: "FAIL", severity: "HIGH", isBlocking: true });
  });

  it("FAILs (CRITICAL) when multiple active BOM versions exist (Safety S3)", async () => {
    const results = await bomRule.evaluate(
      baseContext({
        productBoms: [
          { id: "bom_1", version: "1", status: "ACTIVE" },
          { id: "bom_2", version: "2", status: "ACTIVE" },
        ],
      })
    );
    const result = find(results, "BOM_ACTIVE_DUPLICATE");
    expect(result).toMatchObject({ status: "FAIL", severity: "CRITICAL", isBlocking: true });
  });
});