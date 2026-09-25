-- Relax three uniqueness constraints so the database can represent every
-- configuration state the readiness engine has to be able to evaluate.
--
-- 1. IdentifierRange (productId, prefix)
--    A product legitimately holds several serial blocks over time — one ACTIVE
--    block plus archived INACTIVE/EXHAUSTED ones. The unique index also made the
--    overlapping-range integrity check (Safety Rule 3) unreachable: the
--    configuration service could never persist the conflict it warns about.
--
-- 2. ProductInventoryMapping (productId, mappingType)
--    A product may only have one *active* output mapping, but repointing a
--    product must keep the previous mapping as history. The unique index
--    prevented that and made the "exactly one active mapping" rule untestable.
--
-- 3. Routing (productId, code)
--    Superseding a routing means creating a new version of the same code. The
--    unique index made two ACTIVE versions of one code impossible to represent,
--    so the engine's duplicate-active check could never fire.
--
-- The invariants themselves are not lost: they are enforced by the readiness
-- engine (blocking, deterministic) and reported as advisories by the
-- configuration services. The indexes below keep the lookups those checks
-- perform indexed.

DROP INDEX IF EXISTS "IdentifierRange_productId_prefix_key";
DROP INDEX IF EXISTS "ProductInventoryMapping_productId_mappingType_key";
DROP INDEX IF EXISTS "Routing_productId_code_key";

CREATE INDEX "IdentifierRange_productId_prefix_status_idx" ON "IdentifierRange"("productId", "prefix", "status");
CREATE INDEX "ProductInventoryMapping_productId_mappingType_status_idx" ON "ProductInventoryMapping"("productId", "mappingType", "status");
CREATE INDEX "Routing_productId_code_idx" ON "Routing"("productId", "code");
