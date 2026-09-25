# Build a Production-Ready NPI Readiness Checker — End-to-End

You are a senior full-stack engineer and solution architect.

Build a complete, working, end-to-end **NPI (New Product Introduction) Readiness Checker** for a manufacturing environment.

This is for a technical hiring hackathon. The application must demonstrate strong engineering fundamentals: clean architecture, relational data modeling, deterministic business rules, API design, validation, security, testing, error handling, observability, and a polished user experience.

Do NOT build a static prototype or frontend-only demo.

Everything must be integrated and runnable locally.

---

# 1. PRODUCT OBJECTIVE

The application answers one core question:

> "Is this product + BOM version + routing + production line completely ready to enter production?"

A field/manufacturing engineer selects:

* Product
* BOM Version
* Routing
* Production Line

The system retrieves the relevant manufacturing configuration and executes a deterministic readiness-checking engine.

It must identify:

* What passed
* What failed
* Why it failed
* Severity
* Exact affected entity
* Recommended remediation
* Dependencies between failures
* Overall readiness percentage
* Whether production should be blocked

The system must never claim a product is ready when a mandatory safety/configuration requirement has failed.

---

# 2. TECH STACK

Use this stack unless there is a strong technical reason otherwise:

## Frontend

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* React Hook Form
* Zod
* TanStack Query where useful
* Lucide icons
* Recharts only where charts add real value

## Backend

Prefer Next.js Route Handlers for this hackathon unless a separate backend is clearly justified.

Use:

* TypeScript
* Zod validation
* Service layer
* Repository/data-access layer
* Deterministic readiness rule engine

## Database

* PostgreSQL
* Prisma ORM

## Testing

* Vitest or Jest
* React Testing Library
* API/integration tests
* Playwright for critical E2E flows

## Deployment readiness

The application should be deployable to:

* Vercel
* PostgreSQL provider such as Neon/Supabase

Do not make deployment mandatory for local development.

---

# 3. IMPORTANT ARCHITECTURE REQUIREMENT

Use a modular architecture.

Suggested structure:

```text
src/
  app/
    dashboard/
    products/
    readiness/
    api/

  components/
    ui/
    dashboard/
    readiness/
    products/

  lib/
    db/
    auth/
    validation/
    security/
    logging/

  modules/
    products/
    bom/
    routing/
    stations/
    operators/
    work-instructions/
    inventory/
    readiness/

  modules/readiness/
    rules/
    engine.ts
    types.ts
    dependency-analyzer.ts
    scoring.ts
    remediation.ts

  prisma/
    schema.prisma
    seed.ts

  tests/
```

Keep business logic out of React components.

Keep database queries out of UI components.

The readiness engine must be independently testable.

---

# 4. CORE DOMAIN MODEL

Create a realistic relational schema.

At minimum include:

## Product

```text
id
sku
name
description
status
createdAt
updatedAt
```

Status:

```text
DRAFT
ACTIVE
INACTIVE
```

---

## BOMVersion

```text
id
productId
version
status
effectiveFrom
effectiveTo
createdAt
updatedAt
```

Status:

```text
DRAFT
ACTIVE
OBSOLETE
```

---

## BOMItem

```text
id
bomVersionId
componentSku
componentName
quantity
unit
isRequired
```

---

## Routing

```text
id
productId
code
version
status
createdAt
updatedAt
```

---

## RoutingOperation

```text
id
routingId
sequence
operationCode
operationName
standardCycleTimeSeconds
required
stationId
```

The sequence must be unique within a routing.

---

## Station

```text
id
code
name
status
lineId
capabilities
```

Status:

```text
ACTIVE
INACTIVE
MAINTENANCE
```

---

## Line

```text
id
code
name
status
```

---

## WorkInstruction

```text
id
routingOperationId
title
content
version
status
required
```

Status:

```text
DRAFT
ACTIVE
OBSOLETE
```

---

## Operator

```text
id
employeeCode
name
status
```

---

## OperatorStationAssignment

```text
id
operatorId
stationId
validFrom
validTo
status
```

---

## IdentifierRange

```text
id
productId
prefix
startNumber
endNumber
currentNumber
status
```

---

## InventoryItem

```text
id
sku
name
status
```

---

## ProductInventoryMapping

```text
id
productId
inventoryItemId
mappingType
status
```

mappingType:

```text
OUTPUT
```

---

## ReadinessCheck

```text
id
productId
bomVersionId
routingId
lineId
status
score
passedCount
failedCount
warningCount
startedAt
completedAt
createdAt
```

Status:

```text
READY
NOT_READY
BLOCKED
ERROR
```

---

## ReadinessResult

```text
id
readinessCheckId
ruleCode
category
status
severity
title
message
affectedEntityType
affectedEntityId
remediation
isBlocking
createdAt
```

Status:

```text
PASS
WARNING
FAIL
```

Severity:

```text
INFO
LOW
MEDIUM
HIGH
CRITICAL
```

---

## AuditLog

```text
id
actorId
action
entityType
entityId
metadata
createdAt
```

Do not store sensitive information unnecessarily.

---

# 5. READINESS CHECK RULES

Implement the following rules as independent rule modules.

Every rule must return a standardized result.

Example:

```typescript
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
};
```

---

# RULE 1 — BOM

Check:

1. BOM exists
2. BOM is active
3. BOM belongs to selected product
4. BOM has at least one required component
5. Required components have valid quantity
6. No duplicate required component records
7. No invalid component quantities

Examples:

```text
PASS
Active BOM exists with all required components.

FAIL
BOM does not exist.

FAIL
BOM exists but is not active.

FAIL
Required component Display has quantity 0.
```

---

# RULE 2 — ROUTING

Check:

1. Routing exists
2. Routing is active
3. Routing belongs to selected product
4. Routing has operations
5. Sequence numbers are valid
6. No duplicate sequence numbers
7. Every required operation has a station
8. Station is active
9. Station belongs to selected line
10. Cycle time is valid

---

# RULE 3 — WORK INSTRUCTIONS

For every required routing operation:

Check:

1. Work instruction exists
2. Work instruction is active
3. Correct operation mapping
4. Required instructions are not empty
5. Only active version is used

If missing:

```text
FAIL
Missing active work instruction for operation:
Display Installation
```

---

# RULE 4 — IDENTIFIER RANGE

Check:

1. Identifier range exists
2. Range is active
3. Prefix exists
4. Start number < end number
5. Current number is within range
6. Range belongs to selected product
7. No overlapping active ranges for the same product

This is an important integrity/safety check.

---

# RULE 5 — OUTPUT INVENTORY MAPPING

Check:

1. Product has output inventory mapping
2. Inventory item exists
3. Inventory item is active
4. SKU matches expected product
5. There is exactly one active output mapping

If missing:

```text
FAIL
Finished goods inventory item is not mapped.
```

---

# RULE 6 — OPERATOR ASSIGNMENT

For every required station:

Check:

1. Station has at least one eligible operator
2. Operator is active
3. Assignment is currently valid
4. Assignment is not expired
5. Operator is not assigned to an inactive station

If no valid operator:

```text
FAIL
No active operator assigned to Testing Station.
```

---

# RULE 7 — STATION CONFIGURATION

Check:

1. Station exists
2. Station is active
3. Station belongs to selected line
4. Required capabilities exist
5. Station is not in maintenance
6. Every required routing operation has exactly one valid station

---

# 6. SAFETY CHECKS

This is critical.

Treat safety/configuration failures differently from ordinary warnings.

Implement a dedicated safety validation layer.

## Safety principle

The system should be **fail-safe**.

If required safety/configuration information cannot be verified, do not return:

```text
READY
```

Instead return:

```text
BLOCKED
```

or:

```text
NOT_READY
```

depending on the severity.

---

## Safety Rule 1 — Missing Critical Configuration

If a critical required configuration cannot be verified because of:

* database error
* missing data
* inconsistent data
* timeout
* corrupted configuration

do not assume PASS.

Return:

```text
BLOCKED
```

with:

```text
Unable to verify critical production configuration.
Production readiness cannot be confirmed.
```

---

## Safety Rule 2 — Conflicting Configuration

Detect contradictions such as:

```text
Routing says:
Station A

Database says:
Station A is INACTIVE
```

Result:

```text
CRITICAL
FAIL
BLOCKING
```

---

## Safety Rule 3 — Duplicate Active Configuration

Examples:

* Two active BOM versions
* Two active output inventory mappings
* Duplicate routing sequence
* Multiple conflicting identifier ranges

These should generate blocking failures where appropriate.

---

## Safety Rule 4 — Expired Assignments

Never treat an expired operator assignment as valid.

---

## Safety Rule 5 — Maintenance Stations

A station marked:

```text
MAINTENANCE
```

must not be considered production-ready.

---

## Safety Rule 6 — Data Integrity

Use:

* foreign keys
* unique constraints
* check constraints where supported
* transactions
* optimistic concurrency where appropriate

Never silently repair inconsistent data.

---

# 7. READINESS SCORING

Use scoring for visibility, but do NOT let the score override blocking rules.

Example:

```text
7 categories

5 PASS
1 WARNING
1 FAIL
```

Could produce:

```text
71%
NOT READY
```

But:

```text
6 PASS
1 CRITICAL FAIL
```

must still be:

```text
NOT READY / BLOCKED
```

even if the numerical score is high.

Implement:

```typescript
if (criticalBlockingFailure) {
  status = "BLOCKED";
} else if (blockingFailure) {
  status = "NOT_READY";
} else {
  status = "READY";
}
```

---

# 8. DEPENDENCY ANALYSIS

Implement basic root-cause analysis.

Example:

```text
Station missing
      ↓
Routing operation invalid
      ↓
Operator assignment impossible
      ↓
Production blocked
```

The UI should identify:

```text
ROOT BLOCKER

Testing Station is not configured.

This affects:
- Routing
- Operator assignment
```

Do not duplicate the same underlying problem as multiple unrelated blockers when possible.

---

# 9. API DESIGN

Create clean APIs.

## Products

```http
GET /api/products
GET /api/products/:id
POST /api/products
```

## BOM

```http
GET /api/products/:id/boms
GET /api/boms/:id
```

## Routing

```http
GET /api/products/:id/routings
GET /api/routings/:id
```

## Lines

```http
GET /api/lines
GET /api/lines/:id
```

## Readiness

```http
POST /api/readiness/check
GET /api/readiness/:id
GET /api/readiness/:id/results
GET /api/products/:id/readiness-history
```

---

# 10. READINESS API INPUT

The main endpoint:

```http
POST /api/readiness/check
```

Request:

```json
{
  "productId": "prod_001",
  "bomVersionId": "bom_003",
  "routingId": "route_002",
  "lineId": "line_001"
}
```

Validate everything with Zod.

Reject:

* missing fields
* invalid IDs
* malformed input
* IDs that do not belong together

Do not trust frontend validation.

Backend validation is mandatory.

---

# 11. READINESS API OUTPUT

Return:

```json
{
  "id": "check_001",
  "status": "NOT_READY",
  "score": 71,
  "summary": {
    "total": 7,
    "passed": 5,
    "warnings": 0,
    "failed": 2,
    "blocking": 2
  },
  "checks": [
    {
      "ruleCode": "BOM_ACTIVE",
      "category": "BOM",
      "status": "PASS",
      "severity": "INFO",
      "title": "BOM is active",
      "message": "BOM V3 is active and valid.",
      "isBlocking": false
    },
    {
      "ruleCode": "WORK_INSTRUCTION_EXISTS",
      "category": "WORK_INSTRUCTIONS",
      "status": "FAIL",
      "severity": "HIGH",
      "title": "Work instruction missing",
      "message": "Display Installation has no active work instruction.",
      "remediation": "Create and activate a work instruction for Display Installation.",
      "isBlocking": true
    }
  ],
  "rootBlockers": []
}
```

---

# 12. FRONTEND

Create a polished enterprise-style UI.

Do not make it look like a generic CRUD dashboard.

Use:

* clear hierarchy
* cards
* tables
* badges
* progress indicators
* filters
* tooltips
* empty states
* loading states
* error states
* responsive layout

---

# 13. MAIN DASHBOARD

Show:

```text
NPI Readiness Checker

Products
Active Lines
Recent Checks
Ready Products
Blocked Products
```

Also show recent readiness checks.

---

# 14. READINESS CHECK PAGE

Create:

```text
Product
[B]

BOM Version
[BOM-V3]

Routing
[ROUTE-102]

Production Line
[LINE-02]

[ RUN READINESS CHECK ]
```

Disable the button while checking.

Show progress:

```text
Validating BOM...
Validating Routing...
Validating Stations...
Validating Operators...
Analyzing blockers...
```

---

# 15. RESULT PAGE

Display:

```text
71%

NOT READY
```

Then:

```text
BOM                     PASS
Routing                 PASS
Work Instructions       FAIL
Identifier Range        PASS
Inventory Mapping       PASS
Operators               FAIL
Stations                PASS
```

Use clear semantic colors, but do not rely only on color.

Include icons and text.

---

# 16. BLOCKER DETAILS

Clicking a failed check should show:

```text
Work Instructions

❌ FAILED

Display Installation

Problem:
No active work instruction exists.

Impact:
Production cannot safely execute this operation.

Recommended action:
Create and activate the required work instruction.

Affected entity:
Operation: OP-003
```

---

# 17. READINESS HISTORY

Show previous checks:

```text
Product        Score     Status       Date
Smart Watch    100%      READY        Today
Smart Watch    71%       NOT READY    Yesterday
Control Unit   43%       BLOCKED      Yesterday
```

Clicking one should show its immutable results.

---

# 18. DEMO DATA

Create substantial realistic seed data.

At least:

* 5 products
* 5 BOM versions
* 20+ BOM items
* 5 routings
* 20+ routing operations
* 10 stations
* 3 production lines
* 15 operators
* work instructions
* identifier ranges
* inventory items
* mappings

Intentionally create:

### Product 1

Everything valid.

Result:

```text
READY
100%
```

### Product 2

Missing work instructions.

Result:

```text
NOT_READY
```

### Product 3

Missing operator assignments.

Result:

```text
NOT_READY
```

### Product 4

Inactive station.

Result:

```text
BLOCKED
```

### Product 5

Conflicting configuration.

Result:

```text
BLOCKED
```

This is essential for demonstrating the application.

---

# 19. SECURITY

Implement practical web security.

## Authentication

If authentication is implemented:

* secure sessions
* password hashing if credentials are used
* never store plaintext passwords
* protect private routes

If authentication is intentionally simplified for the hackathon demo, document that clearly.

## Authorization

Create roles:

```text
ADMIN
ENGINEER
VIEWER
```

Example:

```text
ADMIN
→ manage configuration

ENGINEER
→ run readiness checks

VIEWER
→ view results
```

Do not rely on frontend role checks alone.

Verify permissions on the server.

---

# 20. INPUT SECURITY

Protect against:

* SQL injection through ORM usage
* XSS
* malformed JSON
* oversized requests
* invalid IDs
* path traversal
* prototype pollution where relevant

Use Zod schemas on every write endpoint.

Never directly interpolate SQL.

---

# 21. API SECURITY

Implement:

* rate limiting where practical
* consistent error responses
* request size limits
* authorization
* server-side validation
* safe logging
* no stack traces in production responses

Example production error:

```json
{
  "error": {
    "code": "READINESS_CHECK_FAILED",
    "message": "Unable to complete readiness validation."
  }
}
```

Do not expose:

```text
Prisma stack trace
database credentials
internal paths
environment variables
```

---

# 22. SECRETS

Use environment variables:

```env
DATABASE_URL=
AUTH_SECRET=
```

Never hardcode:

* passwords
* API keys
* tokens
* database credentials

Create:

```text
.env.example
```

with placeholder values.

Never commit `.env`.

---

# 23. DATABASE SAFETY

Use:

* transactions for readiness result creation
* foreign keys
* unique constraints
* indexes
* cascading behavior intentionally
* timestamps

Readiness results should be immutable after completion.

If configuration changes later, a new readiness check should be created rather than silently rewriting historical results.

---

# 24. ERROR HANDLING

Every major operation must handle:

* network errors
* database errors
* validation errors
* missing entities
* inconsistent data
* unexpected exceptions

Frontend should show useful messages.

Example:

```text
We couldn't complete the readiness check.

The configuration could not be verified.
No readiness decision was made.

[TRY AGAIN]
```

Never silently treat an error as a successful check.

---

# 25. OBSERVABILITY

Add structured logging.

Log:

```text
requestId
timestamp
action
endpoint
duration
result
errorCode
```

Do not log sensitive data.

Add readiness-check execution duration.

Example:

```text
Readiness check completed
checkId=...
duration=184ms
status=NOT_READY
```

---

# 26. TESTING

Write meaningful tests.

## Unit tests

Test every readiness rule.

Examples:

```text
BOM exists → PASS

BOM missing → FAIL

Inactive BOM → FAIL

Missing station → FAIL

Active operator → PASS

Expired operator assignment → FAIL

Maintenance station → FAIL

Valid identifier range → PASS

Overlapping identifier ranges → FAIL
```

---

## Integration tests

Test:

```text
POST /api/readiness/check
```

with realistic database data.

Verify:

* correct status
* correct score
* correct blockers
* correct persistence

---

## E2E test

Automate this complete scenario:

```text
Open dashboard
      ↓
Select product
      ↓
Select BOM
      ↓
Select routing
      ↓
Select line
      ↓
Click Check Readiness
      ↓
Results appear
      ↓
Open blocker
      ↓
View remediation
```

---

# 27. ACCESSIBILITY

Follow basic accessibility practices:

* keyboard navigation
* proper labels
* semantic HTML
* visible focus states
* aria labels where needed
* sufficient contrast
* do not rely only on color

---

# 28. PERFORMANCE

Avoid unnecessary queries.

Use Prisma efficiently.

Prefer:

* selective fields
* indexed lookups
* batch queries
* transactions where appropriate

Avoid N+1 queries.

The readiness check should perform the required validation efficiently.

---

# 29. UX STATES

Every page must handle:

### Loading

```text
Checking production readiness...
```

### Empty

```text
No products found.
```

### Error

```text
Unable to load products.
Try again.
```

### Success

```text
Production configuration is ready.
```

### Failure

```text
Production is not ready.
3 blockers require attention.
```

---

# 30. OPTIONAL ADVANCED FEATURE

If the core system is complete, add a remediation assistant.

For example:

```text
3 blockers detected.

1. Configure Testing Station
2. Assign an operator to Testing Station
3. Create work instruction for Testing
```

Optionally allow:

```text
"Explain these blockers in simple language."
```

If an LLM is used, it must ONLY explain deterministic system results.

The LLM must NOT decide whether production is safe.

The readiness engine remains the source of truth.

If no LLM API key exists, the application must still work fully.

---

# 31. IMPORTANT AI SAFETY BOUNDARY

Do NOT allow an AI model to independently declare:

```text
PRODUCTION READY
```

The readiness decision must come from deterministic rules.

AI may:

* summarize
* explain
* suggest remediation wording

AI must not:

* override a blocking rule
* bypass safety checks
* change production configuration automatically
* mark an unsafe configuration as ready

---

# 32. SEED SCRIPT

Create:

```bash
npm run db:seed
```

It must populate the complete demo environment.

Also provide:

```bash
npm run db:reset
npm run db:migrate
npm run test
npm run test:e2e
npm run lint
npm run build
npm run dev
```

where appropriate.

---

# 33. README

Create an excellent README containing:

## Project overview

## Problem statement

## Solution

## Architecture

## Database schema

## Readiness rules

## Safety model

## API documentation

## Setup instructions

## Environment variables

## Running locally

## Running tests

## Demo credentials if applicable

## Example readiness scenarios

## Design decisions

## Tradeoffs

## Future improvements

---

# 34. DO NOT OVERENGINEER

Do NOT introduce:

* unnecessary microservices
* Kafka unless genuinely needed
* Kubernetes
* complex distributed systems
* unnecessary AI agents
* unnecessary cloud infrastructure

A well-designed modular monolith is preferred.

Focus on:

```text
Correctness
+
Reliability
+
Security
+
Clean architecture
+
Good UX
```

---

# 35. FINAL ACCEPTANCE CRITERIA

The implementation is complete only when all of these work:

[ ] Application starts locally

[ ] PostgreSQL schema works

[ ] Prisma migrations work

[ ] Seed data works

[ ] Products can be selected

[ ] BOM can be selected

[ ] Routing can be selected

[ ] Line can be selected

[ ] Readiness check executes

[ ] All 7 major readiness categories are checked

[ ] Safety/blocking checks work

[ ] Readiness score is calculated

[ ] READY / NOT READY / BLOCKED status works

[ ] Detailed failures are shown

[ ] Root blockers are identified

[ ] Remediation suggestions are shown

[ ] Readiness history works

[ ] API validation works

[ ] Authorization works if auth is enabled

[ ] Database constraints work

[ ] Errors are handled safely

[ ] No secrets are hardcoded

[ ] Unit tests pass

[ ] Integration tests pass

[ ] Critical E2E flow passes

[ ] Lint passes

[ ] Production build passes

[ ] README is complete

---

# 36. DEVELOPMENT PROCESS

Do not attempt to generate the entire application blindly in one step.

Work incrementally:

### Phase 1

Set up project and dependencies.

### Phase 2

Create Prisma schema and migrations.

### Phase 3

Create seed data.

### Phase 4

Implement domain services.

### Phase 5

Implement readiness rules.

### Phase 6

Implement readiness engine.

### Phase 7

Implement APIs.

### Phase 8

Build frontend.

### Phase 9

Build result and blocker views.

### Phase 10

Add authentication/authorization and security.

### Phase 11

Add tests.

### Phase 12

Run lint, tests and production build.

### Phase 13

Fix all errors.

### Phase 14

Improve UI polish.

Do not move to the next phase until the previous phase is functional.

---

# 37. FINAL COMMAND

Start by inspecting the existing repository.

If a project already exists:

* preserve useful existing code
* do not unnecessarily rewrite the project
* identify the current framework and database
* integrate into the existing architecture

If no project exists:

* initialize the project using the requested stack.

Then implement the system phase by phase.

After implementation, verify the application by actually running:

```bash
npm run lint
npm run test
npm run build
```

and the relevant database/E2E commands.

Fix errors instead of merely reporting them.

The final result must be a **fully integrated working NPI Readiness Checker**, not a mockup.
