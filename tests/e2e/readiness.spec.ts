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

const ENGINEER = { email: "engineer@npi.local", password: "engineer123" };

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

  // 2. Sign in as an engineer.
  await signIn(page);
  await page.goto("/readiness");
  await expect(
    page.getByRole("heading", { name: "Run Readiness Check" })
  ).toBeVisible();

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
});

test("unauthenticated users cannot reach protected pages", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/login/);
});

test("admins can create a product; engineers cannot", async ({ page }) => {
  test.setTimeout(120_000);

  // Admin signs in and sees the Add product action.
  await page.goto("/login");
  await page.locator("#email").fill("admin@npi.local");
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.goto("/products");
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

  await page.goto("/products");
  await expect(page.getByRole("button", { name: "Add product" })).toHaveCount(0);
});