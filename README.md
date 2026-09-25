# NPI Readiness Checker

A production-ready **New Product Introduction (NPI) Readiness Checker** for manufacturing.

It answers one question deterministically:

> **"Is this product + BOM version + routing + production line completely ready to enter production?"**

The system loads the real manufacturing configuration and runs a deterministic, fail-safe readiness engine across **7 categories** (BOM, Routing, Work Instructions, Identifier Range, Inventory Mapping, Operators, Stations). It reports what passed, what failed, **why** it failed, severity, the exact affected entity, remediation, root-cause blockers, impact chains, an overall readiness percentage, and whether production should be **blocked**.

The readiness decision is made **only** by deterministic rules. A high score can never override a blocking failure, and the engine never assumes PASS when it cannot verify critical configuration.

---

## Problem Statement

Before a product can enter production, a huge amount of configuration must be consistent: the BOM must be active and complete, the routing must reference valid stations on the chosen line, every required operation must have an active work instruction, operators must be assigned and their assignments valid, identifier ranges must be unique and non-overlapping, and finished-goods inventory must be mapped.

In many plants this is checked manually in spreadsheets and tribal knowledge. Configuration drifts, safety-relevant gaps (an INACTIVE station, an expired operator assignment, two active BOMs) go unnoticed, and the first signal arrives after the line has already been set up or parts have been consumed.

## Solution

A web application that:

1. Lets a manufacturing engineer select **Product → BOM Version → Routing → Production Line**.
2. Loads the entire relevant configuration in batched, indexed queries (no N+1).
3. Runs **7 independent rule modules** plus a **dedicated safety validation layer**.
4. Produces an immutable, persisted result: status, score, per-category status, per-check detail, affected entities, remediation, root blockers, and dependency impacts.
5. Exposes a clean REST API and a polished enterprise UI with history and blocker drill-down.

The system is **fail-safe**: if required production configuration cannot be verified (database error, missing data, contradictory data, timeout, corrupt configuration), the result is **BLOCKED** — never READY. It is also **honest about the difference between "exists" and "ready"**: a product with no BOM or no routing is presented as *not configurable* and cannot produce a readiness verdict at all.

---

## Architecture

A modular monolith (per AGENTS.md §34) — Next.js App Router route handlers for the API, a service layer, a repository/data-access layer (`lib/db`), and a deterministic readiness engine in `modules/readiness`.

```
src/
  app/                  # Next.js App Router: pages + /api route handlers
  components/           # UI components (readiness, products, dashboard, ui)
  lib/
    api/                # request logging, consistent HTTP helpers
    auth/               # password hashing, DB-backed sessions, role guards
    client/             # typed API client + TanStack Query hooks
    configuration.ts    # shared, presentational-only configuration gap labels
    db/                 # Prisma client singleton
    logging/            # structured logger (requestId, action, duration)
    security/           # rate limiting, headers
    validation/         # shared Zod schemas
  modules/
    products/ bom/ routing/ stations/ operators/ work-instructions/ inventory/
    readiness/
      rules/            # 7 independent rule modules + helpers
      engine.ts         # deterministic, fail-safe engine (single source of truth)
      loader.ts         # batched context loader (injectable, testable)
      scoring.ts        # status derivation + score (score never overrides blocking)
      dependency-analyzer.ts  # root-cause / impact analysis
      remediation.ts    # remediation suggestions
      serialization.ts  # immutable result → API shape
      service.ts        # orchestration + transaction persistence
  prisma/
    schema.prisma
    migrations/
    seed.ts             # 5 configured scenarios + 1 unconfigured product, self-verifying
  tests/
    unit/               # every rule + engine + scoring + dependency analyzer + services
    integration/        # POST /api/readiness/check against seeded PostgreSQL
    e2e/                # Playwright critical flows
```

**Key architectural properties:**

- **Business logic lives in `modules/`, never in React components.** UI components only call typed hooks (`lib/client`).
- **Database queries never appear in UI components** — the service layer and `lib/db` own persistence.
- **The engine is independently testable** — it depends only on a `ReadinessContextLoader` interface; rules are unit-tested with in-memory loaders and never touch the database.
- **Readiness results are immutable.** Persisted in a transaction; if configuration changes later, engineers run a *new* check. History is never rewritten.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling / UI | Tailwind CSS 4, shadcn-style Radix primitives, Lucide icons |
| Forms / Validation | React Hook Form + Zod 4 (client), Zod 4 on every write endpoint (server) |
| Data fetching | TanStack Query |
| API | Next.js Route Handlers |
| Database | PostgreSQL 14+ via Prisma ORM 7 (`@prisma/adapter-pg`) |
| Testing | Vitest, React Testing Library, Playwright |
| Auth | Database-backed sessions (HttpOnly cookie), scrypt password hashing, RBAC |

---

## Database Schema

18 models and 15 enums in `prisma/schema.prisma`. Core domain models:

`Product`, `BOMVersion`, `BOMItem`, `Routing`, `RoutingOperation`, `Station`, `Line`, `WorkInstruction`, `Operator`, `OperatorStationAssignment`, `IdentifierRange`, `InventoryItem`, `ProductInventoryMapping`.

Readiness (auditable, immutable results): `ReadinessCheck`, `ReadinessResult`.

Supporting: `AuditLog`, `User` (ADMIN / ENGINEER / VIEWER), `Session`.

**Constraints enforce data integrity** (Safety Rule 6):

- Unique `(routingId, sequence)` on routing operations — duplicate sequences are impossible at the storage layer, so `ROUTING_SEQUENCE_DUPLICATE` is defence in depth.
- Unique `(productId, version)` on BOM versions; unique `(productId, code)` on routings; unique `sku` on products and inventory items.
- Unique `(bomVersionId, componentSku)` on BOM items — duplicate component records cannot be stored.
- Unique `(productId, prefix)` on identifier ranges; unique `(productId, mappingType)` on inventory mappings — a product can have **at most one** output mapping in the database, which is what makes the duplicate-active-mapping scenario (`INVENTORY_SINGLE_ACTIVE`) a true integrity signal rather than a UI check.
- Unique `(routingOperationId, version)` on work instructions; unique `employeeCode` on operators.
- Foreign keys throughout with intentional `onDelete` behavior: `Cascade` for configuration that cannot exist without its parent, `Restrict` for configuration that is referenced by an immutable audit record (`ReadinessCheck` → product/BOM/routing/line).
- Indexes on every lookup/filter column used by the readiness loader (`(productId, status)`, `(stationId, status)`, `(readinessCheckId)`, `(productId, createdAt)`, …).

> **Note on what the DB does *not* constrain:** operator-station assignments are indexed but not unique, so two overlapping assignments for the same operator and station can coexist in the data. `OPERATOR_*` rules resolve that at check time by picking currently-valid assignments, and `ReadinessResult` is indexed by `readinessCheckId` (one row per rule result is produced by the transaction, not by a unique index). These are deliberate: the rules stay deterministic without relying on storage-level guarantees that a real plant's legacy data would violate.

---

## Readiness Rules

Each category is an independent rule module returning the standardized `ReadinessRuleResult` contract:

```ts
type ReadinessRuleResult = {
  ruleCode: string;
  category: string;
  status: "PASS" | "WARNING" | "FAIL";
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  message: string;
  affectedEntityType?: string;
  affectedEntityId?: string;
  remediation?: string;
  isBlocking: boolean;
  causeRuleCode?: string; // set by the dependency analyzer
};
```

**RULE 1 — BOM** (`BOM_*`): exists, active, belongs to product, has required components, quantities valid, no duplicates, no invalid quantities, plus *duplicate-active* detection (`BOM_ACTIVE_DUPLICATE`).

**RULE 2 — ROUTING** (`ROUTING_*`): exists, active, belongs to product, has operations, valid + unique sequences, valid cycle times, every required operation has a station, station active, station on the selected line.

**RULE 3 — WORK INSTRUCTIONS** (`WORK_INSTRUCTION_*`): exists, active, correct operation mapping, content non-empty, only the latest active version used, single active version.

**RULE 4 — IDENTIFIER RANGE** (`IDENTIFIER_*`): exists, active, prefix present, `start < end`, `current` in range, belongs to product, **no overlapping active ranges** (`IDENTIFIER_RANGE_OVERLAP`).

**RULE 5 — OUTPUT INVENTORY MAPPING** (`INVENTORY_*`): mapping exists, **exactly one active output mapping** (`INVENTORY_SINGLE_ACTIVE`), inventory item exists + active, SKU matches product.

**RULE 6 — OPERATOR ASSIGNMENT** (`OPERATOR_*`): each required station has an operator, operator active, assignment currently valid, **never treats an expired assignment as valid** (`OPERATOR_ASSIGNMENT_EXPIRED`), operator not assigned to an inactive station.

**RULE 7 — STATION CONFIGURATION** (`STATION_*`): station exists, active, on the selected line, not in maintenance, capabilities satisfied, one valid station per required operation.

All rules are unit-tested (PASS / FAIL / WARNING for every branch, including time-dependent rules using an injectable clock).

---

## Safety Model

The system is **fail-safe**. Safety failures are treated differently from ordinary warnings.

**Status derivation (deterministic, in `scoring.ts`):**

```ts
if (criticalBlockingFailure)   status = "BLOCKED";
else if (blockingFailure)      status = "NOT_READY";
else                           status = "READY";
```

A numerical score is shown for visibility but **never overrides** the status. Example: 6 categories PASS and 1 CRITICAL FAIL is still **BLOCKED**, even at a high score.

| Safety rule | Behavior |
| --- | --- |
| **1. Missing critical configuration** | Any context-load failure, rule crash, or unverifiable critical config → `S1_VERIFICATION_FAILED` CRITICAL → **BLOCKED** with *"Unable to verify critical production configuration. Production readiness cannot be confirmed."* A crashing rule becomes a BLOCKING FAIL, never a silent PASS. |
| **2. Conflicting configuration** | Routing references an INACTIVE station → CRITICAL, FAIL, blocking. |
| **3. Duplicate active configuration** | Two active BOMs, two active output mappings, duplicate routing sequences, overlapping identifier ranges → blocking failures where appropriate. |
| **4. Expired assignments** | An expired operator assignment is never treated as valid. |
| **5. Maintenance stations** | A `MAINTENANCE` station is never production-ready. |
| **6. Data integrity** | Foreign keys, unique constraints, indexes, transactions, timestamps. Inconsistent data is never silently repaired — it produces FAIL/BLOCKED results. |

## Dependency Analysis (Root Blockers)

Failures are classified into **roots** and **impacts**. The engine deduplicates the same underlying problem instead of reporting it as multiple unrelated blockers.

Example chain:

```
Station missing            ← ROOT
      ↓
Routing operation invalid  ← impact
      ↓
Operator assignment impossible ← impact
      ↓
Production blocked
```

The UI shows:

> **ROOT BLOCKER — Testing Station is not configured.**
> This affects: Routing, Operator assignment.

Root blockers are re-derived deterministically from the persisted results on every read — history stays immutable.

---

## API

All endpoints require a session (except `POST /api/auth/login`). Server-side role checks apply on every request; frontend role checks are only cosmetic. Zod validates every write payload; IDs are validated against the database — the API rejects IDs that do not belong together.

### Auth

| Method | Path | Action |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Login (email + password) → HttpOnly session cookie |
| `POST` | `/api/auth/logout` | Destroy session |
| `GET` | `/api/auth/me` | Current user |

### Products / config

| Method | Path | Action |
| --- | --- | --- |
| `GET` | `/api/products` | List products |
| `GET` | `/api/products/:id` | Product detail |
| `GET` | `/api/products/:id/boms` | BOM versions for product |
| `GET` | `/api/boms/:id` | BOM with items |
| `GET` | `/api/products/:id/routings` | Routings for product |
| `GET` | `/api/routings/:id` | Routing with operations + stations |
| `GET` | `/api/lines` | List production lines |
| `GET` | `/api/lines/:id` | Line with stations |

### Readiness

| Method | Path | Action |
| --- | --- | --- |
| `POST` | `/api/readiness/check` | Run a readiness check (see below) |
| `GET` | `/api/readiness/:id` | Immutable check + derived blockers |
| `GET` | `/api/readiness/:id/results` | Raw persisted results |
| `GET` | `/api/readiness` | Global recent history |
| `GET` | `/api/products/:id/readiness-history` | History for one product |
| `GET` | `/api/dashboard/stats` | Dashboard summary metrics |

### `POST /api/readiness/check`

**Request** (validated with Zod; ENGINEER or ADMIN only):

```json
{
  "productId": "prod_002",
  "bomVersionId": "bom_102",
  "routingId": "route_102",
  "lineId": "line_02"
}
```

Rejected with `400` when fields are missing/malformed, or when the BOM/routing does not belong to the product or the line is inconsistent with the routing's stations.

**Response:**

```json
{
  "id": "check_…",
  "status": "NOT_READY",
  "score": 71,
  "summary": { "total": 7, "passed": 5, "warnings": 0, "failed": 2, "blocking": 2 },
  "categoryStatuses": { "BOM": "PASS", "Routing": "PASS", "Work Instructions": "FAIL", … },
  "checks": [
    {
      "ruleCode": "WORK_INSTRUCTION_EXISTS",
      "category": "Work Instructions",
      "status": "FAIL",
      "severity": "HIGH",
      "title": "Work instruction missing",
      "message": "Display Installation has no active work instruction.",
      "affectedEntityType": "RoutingOperation",
      "affectedEntityId": "op_…",
      "remediation": "Create and activate a work instruction for Display Installation.",
      "isBlocking": true
    }
  ],
  "rootBlockers": []
}
```

**Errors** are a consistent envelope with a stable `code` and a safe `message` — no stack traces, database credentials, paths, or env vars:

```json
{ "error": { "code": "READINESS_CHECK_FAILED", "message": "Unable to complete readiness validation." } }
```

---

## Security

- **Authentication:** database-backed sessions. The cookie carries a random 256-bit token; only its **SHA-256 hash** is persisted, so a leaked database cannot be used to impersonate users. Cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production. (Auth is intentionally self-contained for the hackathon — documented, not delegated to an external IdP.)
- **Passwords:** `scrypt` (Node `crypto`, 64-byte key) with a random 16-byte per-user salt and a server-side `AUTH_SECRET` pepper, compared with `timingSafeEqual`. Format `scrypt$<saltHex>$<keyHex>`. Plaintext is never stored or logged.
- **Authorization (server-enforced):** `ADMIN` manages configuration; `ENGINEER` runs readiness checks; `VIEWER` views results. Route handlers verify roles server-side via `lib/auth/guard` — frontend role checks alone are never trusted.
- **Input security:** Zod schemas on every write endpoint; malformed JSON, oversized requests, and unknown fields rejected; IDs validated against the database. All database access goes through the Prisma ORM (parameterized) — no interpolated SQL.
- **Rate limiting:** in-memory token-bucket limiter on auth + check endpoints (per-IP). See Tradeoffs for the production caveat.
- **Headers/secrets:** no secrets in the repo; `.env` is git-ignored; `.env.example` documents every variable.

## Observability

Structured, safe logging via `lib/logging/logger` (JSON in production): every API request logs `requestId`, `timestamp`, `action`, `endpoint`, `duration`, `result`, `errorCode`. Readiness checks log `checkId`, `duration`, `status`. **No sensitive data is logged** (no passwords, tokens, or PII). All API routes are wrapped with `withRequestLog`.

---

## Setup

**Prerequisites:** Node.js 20+, PostgreSQL 14+.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # then fill in real values (see below)

# 3. Create the databases (dev + test), then migrate + seed
npm run db:migrate          # prisma migrate dev  (creates npi_dev tables)
npm run db:seed             # prisma db seed      (5 configured scenarios + 1 unconfigured product + 3 users)
```

For the integration tests, point `TEST_DATABASE_URL` at a second database (e.g. `npi_test`) and run:

```bash
npm run db:reset -- --schema=prisma/schema.prisma  # optionally reset
npm run test
```

> `npm run db:reset` runs `prisma migrate reset --force` against the configured `DATABASE_URL` and re-runs the seed, so it fully recreates the dev environment.

### Environment variables (`/ .env`)

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/npi_dev   # app + Prisma CLI
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/npi_test  # vitest integration suite
AUTH_SECRET=replace-with-a-random-32-byte-hex-string             # password pepper + session token derivation
SESSION_TTL_DAYS=7                                               # session lifetime (default 7)
```

Generate a secret with `openssl rand -hex 32`. **Never commit `.env`.**

---

## Running Locally

```bash
npm run dev        # http://localhost:3000
```

Open the app, sign in (see demo credentials), and use **Run Check**:

1. Select **Product**
2. Select **BOM Version**
3. Select **Routing**
4. Select **Production Line**
5. Click **Run Readiness Check** → progress states → results

The readiness page disables the button while a check is running and shows staged progress (Validating BOM… Validating Routing… Validating Stations… Validating Operators… Analyzing blockers…).

If the selected product is missing a BOM or a routing, the page says so inline next to the affected selector, shows a per-product callout naming the missing pieces, and disables **Run Readiness Check** with a hint linked via `aria-describedby`. Selections are always filtered by the chosen product, so the dropdowns can never offer a BOM or routing from a different product.

On the **Products** page, ADMIN users get an **Add product** button (the same role the server enforces on `POST /api/products`). The dialog validates with the *shared* Zod schema, defaults to `DRAFT` status, and the new product appears in the catalog and dashboard immediately after creation. A newly added product is immediately badged `NOT CONFIGURED` — creating a product does not create its BOM, routing or line configuration.

### Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin@npi.local` | `admin123` |
| ENGINEER | `engineer@npi.local` | `engineer123` |
| VIEWER | `viewer@npi.local` | `viewer123` |

---

## Running Tests

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test          # Vitest: 115 unit + integration + UI tests across 17 files (uses TEST_DATABASE_URL)
npm run test:e2e      # Playwright: 4 critical flows against dev server + seeded db
npm run build         # production build
```

**Test coverage:**

- **Unit + UI tests:** every rule (PASS/FAIL/WARNING for each branch, incl. expired assignments, maintenance stations, overlapping ranges, duplicate actives), the engine's fail-safe behavior (context-load failure → BLOCKED; rule crash → BLOCKED), scoring (score can never override blocking, and a non-blocking FAIL no longer forces NOT_READY), dependency analysis (root vs impact dedup), remediation, serialization, product configuration derivation, readiness-service preflight fail-safe (a DB error during ownership validation persists a BLOCKED check instead of bypassing the engine), and the Add Product dialog (shared-schema validation, payload contract, server-error surfacing).
- **Integration tests:** `POST /api/readiness/check` against a real seeded PostgreSQL database — verifies status, score, blockers, persistence, the exact outcome of all five seeded scenarios, rejection of an unconfigured product (400, never a persisted "ready" check), and the product-configuration projection. Auth is mocked at the session boundary.
- **E2E (Playwright):**
  1. ENGINEER logs in, selects a product/BOM/routing/line, runs a check, sees results (71%, NOT READY), opens a blocker, views remediation.
  2. Unauthenticated users are redirected to login.
  3. ADMIN creates a product through the Add product dialog (unique SKU per run; appears in the catalog), while the ENGINEER does not see the admin-only action.
  4. An **unconfigured** product (`PS5`, no BOM, no routing) is badged `NOT CONFIGURED` in the catalog, shows exactly what is missing on its detail page, and cannot reach or run a check.

  All E2E runs hit the real dev server and seeded demo DB, so server-side auth + role checks are exercised for real. The product created by test 3 is deleted in `afterAll`, so repeated runs leave the demo catalog at exactly the 6 seeded products.

---

## Example Readiness Scenarios (Seeded)

The seed (`npm run db:seed`) builds **6 products** (5 configured + 1 deliberately unconfigured), **6 BOM versions**, **28 BOM items**, **5 routings**, **20 routing operations**, **20 work instructions**, **15 stations**, **3 lines**, **15 operators**, **12 operator assignments** (one deliberately expired), **6 identifier ranges**, **5 inventory items** and **5 output mappings** — and deliberately verifies the engine's expected outcomes at seed time.

| Product | SKU | Scenario defect | Result |
| --- | --- | --- | --- |
| Smart Watch X1 | `SWX-1000` | Everything valid | **READY — 100%** |
| Smart Watch X Lite | `SWX-900` | Missing work instructions (+ operator) | **NOT_READY — 71%** (3 blockers) |
| Control Unit 2000 | `CTU-2000` | Missing operator assignments | **NOT_READY — 86%** (2 blockers) |
| Display Module 4000 | `DPL-4000` | Inactive station on routing | **BLOCKED — 57%** (1 critical blocker) |
| Power Supply 5000 | `PS-5000` | Conflicting config (2 active BOMs + overlapping identifier ranges) | **BLOCKED — 71%** (2 critical blockers) |
| PlayStation 5 | `PS5` | *No BOM version, no routing* | **Not checkable** — badged `NOT CONFIGURED`, `Run check` disabled, and no readiness record can exist |

If a seeded environment's outcome ever diverges from these expectations, the seed script fails loudly — the demo can never silently drift.

### Why an unconfigured product has no readiness record

"Exists" ≠ "ready". `POST /api/readiness/check` **requires** a BOM version and a routing that both belong to the selected product, so an unconfigured product is rejected with a `400` before the engine ever runs. It is never persisted as a `BLOCKED` check either — a `BLOCKED` record would imply the configuration was checked and found unsafe, which is not what happened. The UI surfaces the same truth without a request: the catalog badges it `NOT CONFIGURED`, and the product detail, catalog and Run Check pages all state exactly which pieces are missing and why the check cannot be started.

The fail-safe `BLOCKED` path is reserved for genuine *inability to verify* — a database/loader failure during the ownership preflight, or a context-load or rule crash. Those persist an `S1_VERIFICATION_FAILED` CRITICAL result rather than bypassing the engine.

---

## Design Decisions

- **Deterministic engine over "AI judgment".** The readiness decision is pure logic. An LLM may *explain* blockers in plain language only; it can never override a blocking rule, bypass safety checks, change configuration, or declare a product ready. (There is no LLM dependency in the app; it works fully offline.)
- **Rules are modules with a single result contract.** Adding a rule = one file + tests. Every rule receives a fully-preloaded context, keeping the engine free of N+1 queries (batched `include`/`where in` lookups, indexed Maps).
- **Injectable clock + injectable loader** make rules deterministic and unit-testable without a database.
- **Immutable results.** Historical checks are never rewritten; category statuses and root blockers are re-derived from stored results on read.
- **Fail-safe by construction.** Status is *derived* from checks (CRITICAL → BLOCKED, any blocking → NOT_READY, else READY) rather than stored independently — a bug in persistence cannot accidentally produce READY.
- **Configuration status is derived once, on the server.** `ProductService.deriveConfiguration()` turns raw BOM/routing/line counts into a typed `ProductConfiguration` (gaps + `isFullyConfigured`). The catalog, the product detail page and the Run Check page all render that one server projection, so no React component re-implements "is this product ready to be checked" and the three pages can never disagree.
- **"Not configured" is a distinct state from "not ready".** It is surfaced explicitly (badge, named missing pieces, disabled action, `aria-disabled` + `aria-describedby`) instead of being folded into a rule failure, because there is nothing to score yet.
- **DB-backed sessions with hashed tokens** — a pragmatic, secure auth that needs no external provider.
- **Server-side role enforcement** on every route handler; middleware provides an optimistic UX redirect, never an authorization decision.

## Tradeoffs

- **Single Next.js server** (modular monolith per AGENTS.md §34): simplest deployable artifact; a separate backend was not justified for this scope. If compute isolation or worker processing is later needed, the service layer ports cleanly to a standalone Node service.
- **In-memory rate limiter** (per process): adequate for a single-instance deployment; for multi-instance deployments, swap it for a shared store (e.g. Redis or a `pg`-backed limiter) behind the same interface.
- **In-memory logging** (no external sink): logs are structured and request-scoped, but there is no log aggregator. Add a transport (stdout JSON → CloudWatch/Loki) when deploying at scale.
- **Password auth self-hosted** rather than an OAuth provider: keeps the demo self-contained. The session layer is isolated so an OAuth provider can be added without touching business logic.
- **Roles are static (no fine-grained per-record ACLs)** — appropriate for a manufacturing configuration tool; ADMIN/ENGINEER/VIEWER cover the workflow.

## Future Improvements

- Remediation assistant with LLM-powered plain-language explanations (gated behind `LLM_API_KEY`; engine remains source of truth).
- Background / resumable readiness checks and email/Webhook notifications on config change.
- Approval workflow: DRAFT → REVIEW → APPROVED for BOM/routing/work-instruction changes.
- Pagination + filters on history; CSV/PDF export of a readiness report.
- Multi-tenant organization scoping; audit-log viewer in the UI.
- Shared-store rate limiting, metrics (OpenTelemetry), structured log ingestion for production.

---

## License / Notes

Built as an end-to-end engineering exercise for a manufacturing NPI workflow. Not affiliated with any vendor.