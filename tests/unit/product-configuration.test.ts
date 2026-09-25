import { describe, expect, it } from "vitest";
import { deriveConfiguration } from "@/modules/products/service";

type State = {
  bomVersions: number;
  routings: number;
  activeBoms: number;
  activeBomsWithRequiredItems: number;
  activeRoutings: number;
  activeRoutingsWithOperations: number;
};

/**
 * A product existing in the catalog is NOT the same as a product that can be
 * checked. These tests pin the status-aware rule the UI and API both rely on:
 * mere row counts are not enough — a DRAFT-only BOM/routing (or an ACTIVE but
 * empty one) must not present the product as checkable. This prevents the
 * count-vs-capability bug where "has any BOM rows" was treated as "configured".
 */
describe("deriveConfiguration", () => {
  const configured: State = {
    bomVersions: 1,
    routings: 1,
    activeBoms: 1,
    activeBomsWithRequiredItems: 1,
    activeRoutings: 1,
    activeRoutingsWithOperations: 1,
  };
  const none: State = { ...configured, bomVersions: 0, routings: 0, activeBoms: 0, activeBomsWithRequiredItems: 0, activeRoutings: 0, activeRoutingsWithOperations: 0 };

  it("treats a product with an ACTIVE non-empty BOM and routing as configured", () => {
    expect(deriveConfiguration(configured)).toEqual({
      hasBom: true,
      hasRouting: true,
      activeBomWithRequiredItems: true,
      activeRoutingWithOperations: true,
      isConfigured: true,
      missing: [],
    });
  });

  it("treats a product with no rows at all as NOT configured", () => {
    const config = deriveConfiguration(none);
    expect(config.isConfigured).toBe(false);
    expect(config.hasBom).toBe(false);
    expect(config.hasRouting).toBe(false);
    expect(config.missing).toEqual(["ACTIVE_BOM", "ACTIVE_ROUTING"]);
  });

  it("treats a DRAFT-only BOM as missing an ACTIVE BOM even when rows exist", () => {
    const config = deriveConfiguration({
      ...configured,
      bomVersions: 1,
      activeBoms: 0,
      activeBomsWithRequiredItems: 0,
    });
    expect(config.hasBom).toBe(true);
    expect(config.isConfigured).toBe(false);
    expect(config.missing).toEqual(["ACTIVE_BOM"]);
  });

  it("treats an ACTIVE BOM with no required components as missing components", () => {
    const config = deriveConfiguration({
      ...configured,
      activeBoms: 1,
      activeBomsWithRequiredItems: 0,
    });
    expect(config.hasBom).toBe(true);
    expect(config.activeBomWithRequiredItems).toBe(false);
    expect(config.isConfigured).toBe(false);
    expect(config.missing).toEqual(["BOM_REQUIRED_ITEMS"]);
  });

  it("treats a DRAFT-only routing as missing an ACTIVE routing even when rows exist", () => {
    const config = deriveConfiguration({
      ...configured,
      routings: 2,
      activeRoutings: 0,
      activeRoutingsWithOperations: 0,
    });
    expect(config.hasRouting).toBe(true);
    expect(config.isConfigured).toBe(false);
    expect(config.missing).toEqual(["ACTIVE_ROUTING"]);
  });

  it("treats an ACTIVE routing with no operations as missing operations", () => {
    const config = deriveConfiguration({
      ...configured,
      activeRoutings: 1,
      activeRoutingsWithOperations: 0,
    });
    expect(config.hasRouting).toBe(true);
    expect(config.activeRoutingWithOperations).toBe(false);
    expect(config.isConfigured).toBe(false);
    expect(config.missing).toEqual(["ROUTING_OPERATIONS"]);
  });

  it("reports real gaps as satisfied when any ACTIVE non-empty version exists", () => {
    // Multiple versions, some stale/empty, are fine for the *evaluable* gate
    // (the readiness engine still flags duplicates as blocking advisories).
    const config = deriveConfiguration({
      bomVersions: 3,
      routings: 2,
      activeBoms: 2,
      activeBomsWithRequiredItems: 1,
      activeRoutings: 2,
      activeRoutingsWithOperations: 1,
    });
    expect(config.isConfigured).toBe(true);
    expect(config.missing).toEqual([]);
  });

  it("keeps gaps in remediation order (BOM before ROUTING)", () => {
    expect(deriveConfiguration(none).missing).toEqual(["ACTIVE_BOM", "ACTIVE_ROUTING"]);
  });
});