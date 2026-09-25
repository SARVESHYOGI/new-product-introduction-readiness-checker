import { describe, expect, it } from "vitest";
import { deriveConfiguration } from "@/modules/products/service";

/**
 * A product existing in the catalog is NOT the same as a product that can be
 * checked. These tests pin the rule the UI and API both rely on so an
 * unconfigured product (e.g. PS5 with no BOM and no routing) can never be
 * presented as ready to run.
 */
describe("deriveConfiguration", () => {
  it("treats a product with a BOM and a routing as configured", () => {
    const config = deriveConfiguration({ bomVersions: 1, routings: 1 });
    expect(config).toEqual({
      hasBom: true,
      hasRouting: true,
      isConfigured: true,
      missing: [],
    });
  });

  it("treats a product with no BOM and no routing as NOT configured (PS5 case)", () => {
    const config = deriveConfiguration({ bomVersions: 0, routings: 0 });
    expect(config.isConfigured).toBe(false);
    expect(config.hasBom).toBe(false);
    expect(config.hasRouting).toBe(false);
    expect(config.missing).toEqual(["BOM", "ROUTING"]);
  });

  it("reports only the missing BOM when a routing exists", () => {
    const config = deriveConfiguration({ bomVersions: 0, routings: 2 });
    expect(config.isConfigured).toBe(false);
    expect(config.hasRouting).toBe(true);
    expect(config.missing).toEqual(["BOM"]);
  });

  it("reports only the missing routing when a BOM exists", () => {
    const config = deriveConfiguration({ bomVersions: 3, routings: 0 });
    expect(config.isConfigured).toBe(false);
    expect(config.hasBom).toBe(true);
    expect(config.missing).toEqual(["ROUTING"]);
  });

  it("never reports a configured product as missing anything", () => {
    for (const counts of [
      { bomVersions: 1, routings: 1 },
      { bomVersions: 5, routings: 2 },
      { bomVersions: 9, routings: 9 },
    ]) {
      const config = deriveConfiguration(counts);
      expect(config.isConfigured).toBe(true);
      expect(config.missing).toHaveLength(0);
    }
  });

  it("keeps gaps in remediation order (BOM before ROUTING)", () => {
    expect(deriveConfiguration({ bomVersions: 0, routings: 0 }).missing).toEqual([
      "BOM",
      "ROUTING",
    ]);
  });
});
