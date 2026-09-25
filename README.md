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

The system is **fail-safe**: if required production configuration cannot be verified (database error, missing data, contradictory data, timeout, corrupt configuration), the result is **BLOCKED** — never READY. It is also **honest about the difference between "exists" and "ready"**: a product whose only BOM/routing is DRAFT (or whose ACTIVE BOM/routing is empty) is presented as *not checkable* and cannot produce a readiness verdict at all — "rows exist" is not the same as "can be checked".

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
    db/                 # Prisma client (lazy singleton) + explicit PoolConfig/TLS parsing
    infrastructure.ts   # driver-error → stable 503 code classification
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
    integration/        # readiness API + auth API + configuration-write lifecycle/RBAC tests against seeded PostgreSQL
    e2e/                # Playwright critical flows
```

**Key architectural properties:**

- **Business logic lives in `modules/`, never in React components.** UI components only call typed hooks (`lib/client`).
- **Database queries never appear in UI components** — the service layer and `lib/db` own persistence.
- **The engine is independently testable** — it depends only on a `ReadinessContextLoader` interface; rules are unit-tested with in-memory loaders and never touch the database.
- **Readiness results are immutable.** Persisted in a transaction; if configuration changes later, engineers run a *new* check. History is never rewritten.
- **The Edge boundary stays clean.** `src/proxy.ts` (middleware) imports the session cookie name from `lib/auth/constants`, a dependency-free module, so the database stack is never bundled into the Edge runtime.

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

**Constraints enforce data integrity** (Safety Rule 6), while deliberately keeping *conflicting* configuration representable so the readiness engine (not the storage layer) is the authority:

- Unique `(productId, version)` on BOM versions; unique `(routingId, sequence)` on routing operations — duplicate sequences are impossible at the storage layer, so `ROUTING_SEQUENCE_DUPLICATE` is defence in depth.
- Unique `sku` on products and inventory items; unique `code` on lines; unique `employeeCode` on operators; unique `(bomVersionId, componentSku)` on BOM items — duplicate component records cannot be stored.
- Unique `(routingOperationId, version)` on work instructions.
- **Deliberately relaxed (migration `20260925130000_relax_configuration_uniqueness`):** routings are no longer unique per `(productId, code)`, identifier ranges are no longer unique per `(productId, prefix)`, and inventory mappings are no longer unique per `(productId, mappingType)`. This makes duplicate-active configuration (two active BOMs, same routing code twice, overlapping ranges, two output mappings) *storable and detectable* by the readiness rules (Safety Rule 3) instead of being silently rejected at write time. The write endpoints still tell the engineer about the conflict — see [Configuration Lifecycle & Advisories](#configuration-lifecycle--advisories) — but only the engine decides readiness.
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

All endpoints require a session (except `POST /api/auth/login`). Server-side role checks apply on every request; frontend role checks are only cosmetic. Zod validates every write payload; IDs are validated against the database — the API rejects IDs that do not belong together. Every write returns the created/updated entity *and* any **advisory conflicts** it introduced (see [Configuration Lifecycle & Advisories](#configuration-lifecycle--advisories)).

### Auth

| Method | Path | Action |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Login (email + password) → HttpOnly session cookie |
| `POST` | `/api/auth/logout` | Destroy session |
| `GET` | `/api/auth/me` | Current user |

### Read / browse (any signed-in user)

| Method | Path | Action |
| --- | --- | --- |
| `GET` | `/api/products` | List products (optional `status` filter; unknown values → 400) |
| `GET` | `/api/products/:id` | Product detail (incl. derived configuration projection) |
| `GET` | `/api/products/:id/boms` | BOM versions for product |
| `GET` | `/api/boms/:id` | BOM with items |
| `GET` | `/api/products/:id/routings` | Routings for product |
| `GET` | `/api/routings/:id` | Routing with operations + stations |
| `GET` | `/api/lines` | List production lines |
| `GET` | `/api/lines/:id` | Line with stations |
| `GET` | `/api/stations`, `/api/stations/:id` | Stations |
| `GET` | `/api/operators`, `/api/operators/:id` | Operators |
| `GET` | `/api/inventory-items`, `/api/inventory-items/:id` | Inventory items |
| `GET` | `/api/work-instructions` | Work-instruction versions (filterable by `productId` / `routingOperationId`) |
| `GET` | `/api/routing-operations/:operationId/work-instructions` | Work instructions for one operation |
| `GET` | `/api/products/:id/inventory` | Product inventory: identifier ranges + output mappings |
| `GET` | `/api/products/:id/inventory/ranges`, `…/ranges/:rangeId` | Identifier ranges (detail also returns overlap advisories) |
| `GET` | `/api/products/:id/inventory/mappings` | Output inventory mappings |

### Configuration writes (ADMIN only)

Every write below requires `ADMIN` (server-enforced at the guard; `ENGINEER`/`VIEWER`/anonymous get `401`/`403` before the body is parsed). Unknown keys and malformed payloads are rejected with `400 VALIDATION_ERROR` (schemas are `.strict()`).

| Method | Path | Action |
| --- | --- | --- |
| `POST` | `/api/products` | Create product |
| `PATCH` | `/api/products/:id` | Update product |
| `POST` | `/api/products/:id/boms` | Create BOM version (starts `DRAFT`) |
| `PATCH` | `/api/boms/:id` | Update BOM version (status transition / effective window) |
| `POST` | `/api/boms/:id/items` | Add BOM item |
| `PATCH` / `DELETE` | `/api/boms/:id/items/:itemId` | Update / remove BOM item |
| `POST` | `/api/products/:id/routings` | Create routing (starts `DRAFT`) |
| `PATCH` | `/api/routings/:id` | Update routing |
| `POST` | `/api/routings/:id/operations` | Add routing operation |
| `PATCH` / `DELETE` | `/api/routings/:id/operations/:operationId` | Update / remove routing operation |
| `POST` | `/api/routing-operations/:operationId/work-instructions` | Create WI version (an `ACTIVE` creation supersedes the current active one) |
| `PATCH` | `/api/work-instructions/:id` | Update WI (DRAFT editable; published content frozen) |
| `DELETE` | `/api/work-instructions/:id` | Delete WI (**DRAFT only**) |
| `POST` | `/api/lines` | Create production line |
| `PATCH` | `/api/lines/:id` | Update line |
| `POST` | `/api/stations` | Create station |
| `PATCH` | `/api/stations/:id` | Update station (ACTIVE / INACTIVE / MAINTENANCE) |
| `POST` | `/api/operators` | Create operator |
| `PATCH` | `/api/operators/:id` | Update operator |
| `POST` | `/api/operators/:id/assignments` | Create operator-station assignment |
| `PATCH` / `DELETE` | `/api/operators/:id/assignments/:assignmentId` | Update / remove assignment |
| `POST` | `/api/products/:id/inventory/ranges` | Create identifier range |
| `PATCH` / `DELETE` | `/api/products/:id/inventory/ranges/:rangeId` | Update / remove identifier range |
| `POST` | `/api/products/:id/inventory/mappings` | Create output inventory mapping |
| `PATCH` / `DELETE` | `/api/products/:id/inventory/mappings/:mappingId` | Update / remove output mapping |
| `POST` | `/api/inventory-items` | Create inventory item |
| `PATCH` | `/api/inventory-items/:id` | Update inventory item |

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

Rejected with `400` when fields are missing/malformed, when the BOM/routing does not exist or does not belong to the selected product, or when a routing operation references a station it cannot (missing/belonging to a different line). A *line* that does not match the routing's stations is **not** rejected — it is exactly the kind of contradictory configuration the engine reports deterministically as a blocking failure.

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

## Configuration Lifecycle & Advisories

Versioned configuration (BOM versions, routings, work instructions) follows one shared lifecycle, enforced server-side with a stable error code:

| Current | Legal next states | Notes |
| --- | --- | --- |
| `DRAFT` | `DRAFT`, `ACTIVE`, `OBSOLETE` | Freely editable; publish or discard |
| `ACTIVE` | `ACTIVE`, `OBSOLETE` | Published; the only legal move is superseding with `OBSOLETE` |
| `OBSOLETE` | `OBSOLETE` | Permanent history — never reactivated |

- `ACTIVE → DRAFT` is **rejected** (`INVALID_STATUS_TRANSITION` / `INVALID_INSTRUCTION_STATUS_TRANSITION`): silently un-publishing a version operators may already be trained against would rewrite history with no trace.
- **Published configuration is immutable.** Once a BOM version is published its effective window is frozen (`PUBLISHED_BOM_IMMUTABLE`); a published routing's version label is identity and cannot be renamed (`PUBLISHED_ROUTING_IMMUTABLE`); ACTIVE/OBSOLETE work-instruction content is frozen (`ACTIVE_INSTRUCTION_IMMUTABLE`). Obsoleted BOM items and routing operations become read-only (`OBSOLETE_BOM_IMMUTABLE`, `OBSOLETE_ROUTING_IMMUTABLE`). Re-saving the same values (no-op) stays allowed. Changes always go through a *new version*: publish a replacement and supersede the old one — done transactionally, so two simultaneously active versions can never be created through the editor (Safety Rule 3).
- **Deletes are restricted.** Only DRAFT work instructions (plus BOM items, routing operations, operator assignments, identifier ranges, mappings) can be deleted. Shared resources change status instead, so audit history stays truthful.
- **Advisory conflicts, not silent rejection.** Writes that *represent* configuration conflicts — a second active BOM version, overlapping identifier ranges, a second output mapping, a counter regression — are persisted and surfaced as **advisories** (returned with the write response and stored as `AdvisoryConflict` rows) so the editor can explain them. They never reject the write and never decide readiness: only the readiness engine computes `READY` / `NOT_READY` / `BLOCKED`. A DRAFT or empty BOM/routing tuple is never rejected either — the engine evaluates it fail-safely (it can never come out `READY`); the UI simply does not offer uncheckable options.

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

Infrastructure faults log a single dedicated event carrying only a fixed code and a safe driver `reason` token — never the driver's message, which can embed the connection string:

```json
{"level":"error","event":"infrastructure_error","code":"DATABASE_UNAVAILABLE","reason":"P1001"}
```

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
npm run db:test:setup   # create npi_test if missing → migrate deploy → seed (never touches the dev DB)
npm run test
```

`db:test:setup` creates the test database on the same server, applies migrations, and seeds it — the test suite then wipes and reseeds that dedicated DB itself, so it is fully self-contained and repeatable.

> `npm run db:reset` runs `prisma migrate reset --force` against the configured `DATABASE_URL` and re-runs the seed, so it fully recreates the dev environment.

### Environment variables (`/ .env`)

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/npi_dev   # app + Prisma CLI
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/npi_test  # vitest integration suite
AUTH_SECRET=replace-with-a-random-32-byte-hex-string             # password pepper + session token derivation
SESSION_TTL_DAYS=7                                               # session lifetime (default 7)

# Optional connection tuning (see "Database connection" below)
DATABASE_SSL=require            # disable | require | verify-ca | verify-full
DATABASE_POOL_MAX=5             # per instance; 1 automatically when ?pgbouncer=true
DATABASE_CONNECTION_TIMEOUT_MS=8000
```

Generate a secret with `openssl rand -hex 32`. **Never commit `.env`.**

`DATABASE_URL` and `AUTH_SECRET` are the only two values a deployment must set;
`SESSION_TTL_DAYS` and the three tuning variables all have safe defaults.

### Database connection

`src/lib/db/config.ts` parses `DATABASE_URL` and hands Prisma's `pg` adapter an
**explicit** `PoolConfig` (host, port, database, user, password, `ssl`, pool
size, timeouts) instead of a raw connection string.

This is deliberate. Prisma 7's `pg` driver adapter does not reliably apply the
`sslmode` query parameter when it is given a connection string, so a remote
database that requires TLS — exactly the Vercel + Neon/Supabase case — can fail
to connect even though the URL is correct. Passing explicit fields sidesteps
that. TLS defaults to `require` for any non-local host and `disable` for
`localhost`; `verify-ca` / `verify-full` turn on certificate verification for
providers whose CA is in the runtime trust store.

Pool defaults are sized for serverless (5 connections per instance, dropping to
1 behind a transaction pooler such as PgBouncer) with an 8s connection timeout,
so a stalled database fails fast with a `503` instead of holding a request open.

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

If the selected product is missing an **active** BOM or routing (or its active BOM/routing is empty), the page says so inline next to the affected selector, shows a per-product callout naming the missing pieces, and disables **Run Readiness Check** with a hint linked via `aria-describedby`. Selections are always filtered by the chosen product, and only *checkable* BOMs and routings are offered, so the dropdowns can never offer a BOM or routing from a different product.

On the **Products** page, ADMIN users get an **Add product** button (the same role the server enforces on `POST /api/products`). The dialog validates with the *shared* Zod schema, defaults to `DRAFT` status, and the new product appears in the catalog and dashboard immediately after creation. A newly added product is immediately badged `NOT CHECKABLE` — creating a product does not create its BOM, routing or line configuration.

### Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin@npi.local` | `admin123` |
| ENGINEER | `engineer@npi.local` | `engineer123` |
| VIEWER | `viewer@npi.local` | `viewer123` |

---

## Deployment

The app is a standard Next.js + Prisma deployment (e.g. Vercel + Neon/Supabase PostgreSQL); deployment is optional and never required for local development.

### 1. Provision the database

Create a managed PostgreSQL database and copy its **pooled** connection string.
Vercel functions are short-lived and scale horizontally, so a pooler is strongly
recommended — append `?pgbouncer=true` (or use the provider's `-pooler` host) so
the app opens a single connection per instance instead of five.

### 2. Set the environment variables

Set these in the Vercel project for **every** environment you deploy
(Production *and* Preview), via Project Settings → Environment Variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled PostgreSQL URL. Must point at the same environment you deploy to. |
| `AUTH_SECRET` | yes | `openssl rand -hex 32`. **Changing it invalidates every existing password hash.** |
| `SESSION_TTL_DAYS` | no | Defaults to `7`. |
| `DATABASE_SSL` | no | Defaults to `require` for remote hosts. Set `verify-full` only if the CA is trusted. |
| `DATABASE_POOL_MAX` | no | Defaults to `5`, or `1` with `?pgbouncer=true`. |

### 3. Apply migrations

`npm run build` runs `prisma generate` (types only) — it does **not** create
tables. A fresh production database must be migrated once:

```bash
DATABASE_URL="<production-pooled-url>" npx prisma migrate deploy
```

`migrate deploy` only applies pending migrations; it never drops data, so it is
safe to re-run and is the correct command for CI. There is no `vercel.json` that
runs this automatically, so run it deliberately as a release step.

### 4. Create an admin user

The seed (`npm run db:seed`) is **destructive** — it deletes every existing row
before inserting the demo scenarios. Never run it against a shared or
production database. For a real deployment, insert an admin directly instead:

```sql
INSERT INTO "User" (id, email, name, role, "isActive", "passwordHash", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'you@example.com', 'Owner', 'ADMIN', true,
        '<scrypt hash>', now(), now());
```

Generate the hash with the application helper, never by hand:

```bash
npx tsx -e "import {hashPassword} from './src/lib/auth/password';
           hashPassword('choose-a-strong-password').then(h => console.log(h));"
```

### 5. Deploy and verify

Deploy with framework preset "Next.js" (`npm run build`). Then confirm sign-in
works and that `POST /api/auth/login` answers with a real status code.

### Diagnosing a `500` on `/api/auth/login`

`500 INTERNAL_ERROR` from this endpoint is almost always a database or
configuration fault, and the API now names it explicitly. `src/lib/infrastructure.ts`
maps driver failures onto a fixed set of codes, returned as `503` with no
connection string, host, SQL, or stack trace:

| Response code | Meaning | Fix |
| --- | --- | --- |
| `DATABASE_NOT_CONFIGURED` | `DATABASE_URL` missing or malformed | Set it in Vercel; redeploy |
| `DATABASE_UNAVAILABLE` | DNS/TCP/TLS failure, or pool exhausted | Check the pooled host, firewall, `DATABASE_SSL` |
| `DATABASE_AUTHENTICATION_FAILED` | Server rejected the user/password | Rotate the database credentials in the URL |
| `DATABASE_SCHEMA_NOT_READY` | Tables missing — migrations never ran | `npx prisma migrate deploy` |
| `AUTH_NOT_CONFIGURED` | `AUTH_SECRET` missing | Set it; reseed passwords if it changed |
| `INTERNAL_ERROR` (500) | A real application bug | Read the function log |

Each of these also writes one structured log line with a safe `reason` token
(`P1001`, `28P01`, `P2021`, …) and no driver text — grep the Vercel function log
for `"event":"infrastructure_error"`:

```json
{"level":"error","event":"infrastructure_error","code":"DATABASE_SCHEMA_NOT_READY","reason":"P2021"}
```

To confirm the production schema without touching data:

```sql
SELECT to_regclass('"User"'), to_regclass('"Session"');
SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at;
```

---

## Error Handling

`lib/api/http.ts` shapes every API response through `fail()`:

- Deliberate `ApiError`s (400/401/403/404/409/413/429) pass through unchanged.
- Infrastructure faults become a `503` with a stable code (table above).
- Anything else becomes a `500 INTERNAL_ERROR` with a fixed message in
  production — never a driver message, stack trace, or internal path.

The shared Prisma client is created on first use rather than at module import,
so a missing `DATABASE_URL` fails *inside* the request and is classified, rather
than crashing the module graph and producing an opaque framework error.

---

## Running Tests

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test          # Vitest: 217 unit + integration + UI tests across 21 files (uses TEST_DATABASE_URL)
npm run test:e2e      # Playwright: 4 critical flows against dev server + seeded db
npm run build         # production build
```

**Test coverage:**

- **Unit + UI tests:** every rule (PASS/FAIL/WARNING for each branch, incl. expired assignments, maintenance stations, overlapping ranges, duplicate actives, the work-instruction latest-version warning), the engine's fail-safe behavior (context-load failure → BLOCKED; rule crash → BLOCKED), scoring (score can never override blocking, and a non-blocking FAIL no longer forces NOT_READY), dependency analysis (root vs impact dedup), remediation, serialization, product configuration derivation (the status-aware four-gap contract), readiness-service preflight fail-safe (a DB error during ownership validation persists a BLOCKED check instead of bypassing the engine), and the Add Product dialog (shared-schema validation, payload contract, server-error surfacing).
- **Integration tests (real seeded PostgreSQL):**
  - `POST /api/readiness/check` — verifies status, score, blockers, persistence, the exact outcome of all five seeded scenarios, rejection of an unconfigured product (400, never a persisted "ready" check), and the product-configuration projection.
  - Configuration writes — BOM/routing/WI lifecycle transitions (`INVALID_STATUS_TRANSITION`, `PUBLISHED_BOM_IMMUTABLE`, `PUBLISHED_ROUTING_IMMUTABLE`, `OBSOLETE_BOM_IMMUTABLE`, `OBSOLETE_ROUTING_IMMUTABLE`, `ACTIVE_INSTRUCTION_IMMUTABLE`), server-side RBAC (ENGINEER/VIEWER/anonymous → 401/403 before body parsing; ADMIN allowed), and strict schemas (unknown keys → `400 VALIDATION_ERROR`).
- **E2E (Playwright):**
  1. ENGINEER logs in, selects a product/BOM/routing/line, runs a check, sees results (71%, NOT READY), opens a blocker, views remediation.
  2. Unauthenticated users are redirected to login.
  3. ADMIN creates a product through the Add product dialog (unique SKU per run; appears in the catalog), while the ENGINEER does not see the admin-only action.
  4. An **unconfigured** product (`PS5`, no BOM, no routing) is badged `NOT CHECKABLE` in the catalog, shows exactly what is missing on its detail page, and cannot reach or run a check.

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
| PlayStation 5 | `PS5` | *No BOM version, no routing* | **Not checkable** — badged `NOT CHECKABLE`, `Run check` disabled, and no readiness record can exist |

If a seeded environment's outcome ever diverges from these expectations, the seed script fails loudly — the demo can never silently drift.

### Why an unconfigured product has no readiness record

"Exists" ≠ "ready", and neither equals "checkable". `POST /api/readiness/check` **requires** a BOM version and a routing that both belong to the selected product, so an unconfigured product is rejected with a `400` before the engine ever runs. It is never persisted as a `BLOCKED` check either — a `BLOCKED` record would imply the configuration was checked and found unsafe, which is not what happened.

Checkability is derived on the server from *four* status-aware gaps (`ProductService.deriveConfiguration`): the product needs an **active BOM**, an **active BOM with required components**, an **active routing**, and an **active routing with operations**. A product whose only BOM/routing is `DRAFT`, or whose active BOM is empty, is **not checkable** even though rows exist. The UI surfaces the same truth without a request: the catalog badges it `NOT CHECKABLE`, and the product detail, catalog and Run Check pages all state exactly which pieces are missing and why the check cannot be started.

Deliberately, the API does *not* reject a DRAFT or empty tuple that is passed in explicitly — the readiness engine is the sole authority and evaluates it fail-safely (it can never come out `READY`). UI gating is an advisory for a better experience, not a rule.

The fail-safe `BLOCKED` path is reserved for genuine *inability to verify* — a database/loader failure during the ownership preflight, or a context-load or rule crash. Those persist an `S1_VERIFICATION_FAILED` CRITICAL result rather than bypassing the engine.

---

## Design Decisions

- **Deterministic engine over "AI judgment".** The readiness decision is pure logic. An LLM may *explain* blockers in plain language only; it can never override a blocking rule, bypass safety checks, change configuration, or declare a product ready. (There is no LLM dependency in the app; it works fully offline.)
- **Rules are modules with a single result contract.** Adding a rule = one file + tests. Every rule receives a fully-preloaded context, keeping the engine free of N+1 queries (batched `include`/`where in` lookups, indexed Maps).
- **Injectable clock + injectable loader** make rules deterministic and unit-testable without a database.
- **Immutable results.** Historical checks are never rewritten; category statuses and root blockers are re-derived from stored results on read.
- **Fail-safe by construction.** Status is *derived* from checks (CRITICAL → BLOCKED, any blocking → NOT_READY, else READY) rather than stored independently — a bug in persistence cannot accidentally produce READY.
- **Configuration status is derived once, on the server.** `ProductService.deriveConfiguration()` derives checkability from six status-aware counts (active/populated BOM and routing, plus history) into a typed `ProductConfiguration` (`hasBom`, `hasRouting`, `activeBomWithRequiredItems`, `activeRoutingWithOperations`, `missing` gaps, `isConfigured`). The catalog, the product detail page and the Run Check page all render that one server projection, so no React component re-implements "is this product ready to be checked" and the three pages can never disagree.
- **"Not checkable" is a distinct state from "not ready".** It is surfaced explicitly (badge, named missing pieces, disabled action, `aria-disabled` + `aria-describedby`) instead of being folded into a rule failure, because there is nothing to score yet.
- **The engine is the only authority on readiness, and the write layer never makes the call — or hides it.** Configuration writes persist whatever the editor asks (with the documented lifecycle/immutability guards) and return advisory conflicts when the result represents one. It is the deterministic engine that turns those advisories into fail/block decisions, and a ready-looking score can never override them.
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