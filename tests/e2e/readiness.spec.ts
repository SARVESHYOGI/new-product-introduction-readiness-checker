/**
 * Critical end-to-end flow (see AGENTS.md §26):
 *
 * Open dashboard → select product → select BOM → select routing → select line →
 * click "Run Readiness Check" → results appear → open a blocker → view remediation.
 *
 * Runs against the real dev server + seeded demo database. Uses the ENGINEER
 * demo account so server-side role checks are exercised for real.
 */
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";
import { Client } from "pg";

const ENGINEER = { email: "engineer@npi.local", password: "engineer123" };

/**
 * The admin flow below creates a real product (this app deliberately exposes no
 * DELETE endpoint). Remove those rows afterwards so repeated E2E runs do not
 * litter the seeded demo catalog with DRAFT products.
 *
 * Uses the `pg` driver directly rather than the generated Prisma client: the
 * generated client is ESM-only and Playwright transpiles specs to CommonJS.
 */
test.afterAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "Product" WHERE "sku" LIKE 'E2E-%'`);
  } finally {
    await client.end();
  }
});

// prod_002 ("Smart Watch X Lite") is seeded to be NOT_READY at 71% because its
// work instructions are missing — the ideal target for the blocker/remediation
// portion of this test.
const CONFIG = {
  product: /Smart Watch X Lite/,
  bom: /^BOM V2\b/,
  routing: /^SWXL-ROUTE/,
  line: /^Assembly Line 2/,
};

async function signIn(page: Page) {
  await page.locator("#email").fill(ENGINEER.email);
  await page.locator("#password").fill(ENGINEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The login form redirects client-side; wait until we leave /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function selectOption(page: Page, comboboxName: string, optionName: RegExp) {
  await page.getByRole("combobox", { name: comboboxName, exact: true }).click();
  await page.getByRole("option", { name: optionName }).click();
}

test("engineer runs a readiness check and views blocker remediation", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Open the readiness page — unauthenticated visitors are redirected to /login.
  await page.goto("/readiness");
  await expect(page).toHaveURL(/\/login/);

  // 2. Sign in as an engineer. The login form redirects *client-side* back to
  // /readiness (from=/readiness), leaving the auth cache hot — exactly the
  // path that regressed and wrongly showed "Read-only access" to admins and
  // engineers (useLogin had cached a wrapped user object). This is a nav
  // without a full page reload, so the role gate must come from the cache.
  await signIn(page);
  await expect(page).toHaveURL(/\/readiness/);
  await expect(
    page.getByRole("heading", { name: "Run Readiness Check" })
  ).toBeVisible();
  await expect(page.getByText("Read-only access")).toHaveCount(0);

  // React logs the "Select is changing from uncontrolled to controlled"
  // warning through console.error. Capture console errors over the whole
  // interaction and assert none of them is such a warning (or any React
  // warning) at the end — regression guard for the run check selects.
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // 3–6. Select product, BOM version, routing and production line.
  await selectOption(page, "Product", CONFIG.product);
  await selectOption(page, "BOM Version", CONFIG.bom);
  await selectOption(page, "Routing", CONFIG.routing);
  await selectOption(page, "Production Line", CONFIG.line);

  // 7. Click "Run Readiness Check" and wait for the result page.
  const runButton = page.getByRole("button", { name: "Run Readiness Check" });
  await expect(runButton).toBeEnabled();
  await runButton.click();
  await page.waitForURL(/\/readiness\/[^/]+/);

  // 8. Results appear: score, status, category failures.
  await expect(page.getByRole("img", { name: "readiness score: 71%" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Production is not ready" })
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "NOT READY" })).toBeVisible();

  // Category summary lists Work Instructions as failing (missing work
  // instructions is the seeded defect for prod_002).
  const wiCategoryRow = page.locator("li").filter({ hasText: /^Work Instructions/ });
  await expect(wiCategoryRow).toBeVisible();
  await expect(wiCategoryRow.getByText("FAIL")).toBeVisible();

  // 9. Open a blocker to see problem, impact and remediation.
  const blocker = page.getByRole("button", { name: /View details for/ }).first();
  await blocker.click();
  await expect(
    page.getByRole("heading", { name: "Recommended action" })
  ).toBeVisible();

  // 10. Remediation text is non-empty and the affected entity is shown.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Recommended action")).toBeVisible();
  await expect(dialog.getByText(/create|activate|assign|configure/i).first()).toBeVisible();
  await expect(dialog.getByText("Affected entity")).toBeVisible();

  // Close the blocker dialog. The Radix X button also exposes "Close" as its
  // accessible name, so target the explicit Close button (first in DOM).
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Results are immutable — the page states this explicitly.
  await expect(page.getByText(/Results are immutable/)).toBeVisible();

  // No React warnings (e.g. uncontrolled→controlled selects) may have been
  // emitted during the run-check interaction.
  expect(
    consoleErrors.filter((t) => /Select is changing|^Warning:/i.test(t))
  ).toEqual([]);
});

test("unauthenticated users cannot reach protected pages", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/login/);
});

test("an unconfigured product is visibly NOT CONFIGURED and cannot be checked", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/login");
  await signIn(page);

  // The catalog distinguishes "the product exists" from "the product can be
  // checked". prod_006 (PlayStation 5) is seeded with no BOM and no routing.
  await page.goto("/products");
  const ps5Card = page.getByTestId("product-card-prod_006");
  await expect(ps5Card.getByText("NOT CONFIGURED")).toBeVisible();
  await expect(ps5Card.getByText(/Cannot be checked — missing/)).toBeVisible();
  // It must never be presented as ready or as having a passing score.
  await expect(ps5Card.getByText("No check possible yet")).toBeVisible();
  await expect(ps5Card.getByText("READY")).toHaveCount(0);

  // Its detail page states the gap and refuses to offer a run.
  await ps5Card.getByRole("link", { name: "PlayStation 5" }).click();
  await page.waitForURL(/\/products\/prod_006$/);
  await expect(page.getByText(/is missing a BOM version and a routing/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Run check", exact: true })
  ).toHaveAttribute("aria-disabled", "true");

  // On the run-check page the selectors for the unconfigured product are
  // empty and the run button stays disabled with an explanation.
  await page.goto("/readiness?product=prod_006");
  await expect(page.getByRole("heading", { name: "Run Readiness Check" })).toBeVisible();
  await expect(page.getByText("is not fully configured")).toBeVisible();
  await expect(page.getByText(/No BOM versions exist for PlayStation 5/)).toBeVisible();
  await expect(page.getByText(/No routings exist for PlayStation 5/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Readiness Check" })).toBeDisabled();
  await expect(
    page.getByText("This product has no BOM version. Configure a BOM version before running a check.")
  ).toBeVisible();
});

test("admins can create a product; engineers cannot", async ({ page }) => {
  test.setTimeout(120_000);

  // Admin signs in and sees the Add product action.
  await page.goto("/login");
  await page.locator("#email").fill("admin@npi.local");
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  // Navigate client-side via the nav link (no reload) — the role gate must be
  // answered from the auth cache, not a fresh /api/auth/me fetch.
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
  const addButton = page.getByRole("button", { name: "Add product" });
  await expect(addButton).toBeVisible();

  // Create a product with a unique SKU so repeated runs never collide.
  const sku = `E2E-${Date.now()}`;
  const name = `E2E Gadget ${Date.now() % 10000}`;
  await addButton.click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create product" }).click();

  // The new product appears in the catalog (refetch after create).
  await expect(
    page.getByRole("heading", { name, exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText(sku, { exact: true }).first()).toBeVisible();

  // Engineers are not offered the admin-only action.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.locator("#email").fill("engineer@npi.local");
  await page.locator("#password").fill("engineer123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  // Same client-side nav — engineers must not be offered the admin action.
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole("button", { name: "Add product" })).toHaveCount(0);
});