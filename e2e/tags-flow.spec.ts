import { test, expect, type Page } from "@playwright/test";

const TEST_USER = {
  name: "Tags Test User",
  email: `tags-test-${Date.now()}@example.com`,
  password: "TestPassword123!",
};

const TAG_FILE_NAME = "tag-test-file.txt";

test.describe.serial("Document tagging flows", () => {
  // ── Setup: Register, onboard, and upload a test file ──────────────────
  test("setup: register and upload a test file", async ({ page }) => {
    // Register
    await page.goto("/register");
    await page.getByPlaceholder("Your name").fill(TEST_USER.name);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Choose a password").fill(TEST_USER.password);
    await page.getByRole("button", { name: /create account/i }).click();

    // Handle onboarding - create a workspace
    await page.waitForURL("/onboarding", { timeout: 15000 });
    await page.getByPlaceholder("e.g. Acme Inc").fill("Tags Test Workspace");
    await page.getByRole("button", { name: /create workspace/i }).click();
    await page.waitForURL(/\/w\//, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Upload a test file
    await page
      .getByRole("button", { name: /^upload$/i })
      .first()
      .click();
    await page.waitForTimeout(500);

    const fileInput = page.locator(
      '[data-slot="dialog-content"] input[type="file"]',
    );
    const buffer = Buffer.from("Hello, this is a test file for tagging.");
    await fileInput.setInputFiles({
      name: TAG_FILE_NAME,
      mimeType: "text/plain",
      buffer,
    });

    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /upload 1 file/i }).click();
    await page.waitForTimeout(3000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    await expect(page.getByText(TAG_FILE_NAME)).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-01-file-uploaded.png",
    });
  });

  // ── Open Manage Tags dialog from sidebar ─────────────────────────────
  test("open manage tags dialog from sidebar", async ({ page }) => {
    await loginAs(page);

    // Click the Tags button in the sidebar
    const tagsButton = page.getByRole("button", { name: "Tags", exact: true });
    await expect(tagsButton).toBeVisible({ timeout: 5000 });
    await tagsButton.click();
    await page.waitForTimeout(500);

    // Verify the Manage Tags dialog opens
    await expect(
      page.getByRole("heading", { name: "Manage Tags" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("No tags yet")).toBeVisible();
    await page.screenshot({
      path: "e2e/screenshots/tags-02-manage-tags-empty.png",
    });

    await page.keyboard.press("Escape");
  });

  // ── Create tags ──────────────────────────────────────────────────────
  test("create workspace tags", async ({ page }) => {
    await loginAs(page);

    // Open Manage Tags
    const tagsButton = page.getByRole("button", { name: "Tags", exact: true });
    await tagsButton.click();
    await page.waitForTimeout(500);

    // Create first tag: "Invoice"
    await page.getByPlaceholder("New tag name...").fill("Invoice");
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.waitForTimeout(1000);

    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Invoice"),
    ).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-03-first-tag-created.png",
    });

    // Create second tag: "Important"
    await page.getByPlaceholder("New tag name...").fill("Important");
    // Click a different color before adding
    const colorButtons = page.locator(
      '[data-slot="dialog-content"] button.rounded-full',
    );
    // Click the first color (red)
    await colorButtons.first().click();
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.waitForTimeout(1000);

    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Important"),
    ).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-04-two-tags-created.png",
    });

    // Create third tag: "Archive"
    await page.getByPlaceholder("New tag name...").fill("Archive");
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.waitForTimeout(1000);

    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Archive"),
    ).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-05-three-tags-created.png",
    });

    await page.keyboard.press("Escape");
  });

  // ── Assign tags to a file via context menu ───────────────────────────
  test("assign tags to a file", async ({ page }) => {
    await loginAs(page);
    await expect(page.getByText(TAG_FILE_NAME)).toBeVisible({ timeout: 5000 });

    // Open context menu on the file
    await openFileContextMenu(page, TAG_FILE_NAME);
    await page.screenshot({
      path: "e2e/screenshots/tags-06-context-menu-with-edit-tags.png",
    });

    // Click "Edit Tags"
    await page.getByRole("menuitem", { name: /edit tags/i }).click();
    await page.waitForTimeout(500);

    // The Edit Tags dialog should appear
    await expect(page.getByText("Edit Tags")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Select tags to apply")).toBeVisible();
    await page.screenshot({
      path: "e2e/screenshots/tags-07-edit-tags-dialog.png",
    });

    // Select "Invoice" and "Important" tags
    const dialog = page.locator('[data-slot="dialog-content"]');
    await dialog.locator("button", { hasText: "Invoice" }).click();
    await page.waitForTimeout(300);
    await dialog.locator("button", { hasText: "Important" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "e2e/screenshots/tags-08-tags-selected.png",
    });

    // Save
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: "e2e/screenshots/tags-09-tags-saved.png",
    });
  });

  // ── Verify tags are displayed on file row ────────────────────────────
  test("tags are displayed on file rows", async ({ page }) => {
    await loginAs(page);
    await expect(page.getByText(TAG_FILE_NAME)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Verify tag badges are visible on the file row
    const fileRow = page
      .locator("div.grid", { hasText: TAG_FILE_NAME })
      .first();
    await expect(fileRow.getByText("Invoice")).toBeVisible({ timeout: 5000 });
    await expect(fileRow.getByText("Important")).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-10-tags-on-file-row.png",
    });
  });

  // ── Filter files by tag ──────────────────────────────────────────────
  test("filter files by tag", async ({ page }) => {
    await loginAs(page);
    await page.waitForTimeout(1000);

    // The tag filter bar should be visible
    await expect(page.getByText("Filter:")).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-11-filter-bar-visible.png",
    });

    // Click the "Invoice" filter tag
    // The filter bar has tag buttons - find the one in the filter area (not in file rows)
    const filterBar = page.locator("div", { hasText: "Filter:" }).first();
    await filterBar.locator("button", { hasText: "Invoice" }).click();
    await page.waitForTimeout(1000);

    // File should still be visible (it has the Invoice tag)
    await expect(page.getByText(TAG_FILE_NAME)).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-12-filtered-by-invoice.png",
    });

    // Click "Archive" tag filter (file does NOT have this tag)
    await filterBar.locator("button", { hasText: "Archive" }).click();
    await page.waitForTimeout(1000);

    // With AND semantics (Invoice AND Archive), the file should be hidden
    await expect(page.getByText(TAG_FILE_NAME)).not.toBeVisible({
      timeout: 5000,
    });
    await page.screenshot({
      path: "e2e/screenshots/tags-13-filtered-no-results.png",
    });

    // Clear filters
    await page.getByRole("button", { name: /clear/i }).click();
    await page.waitForTimeout(1000);

    // File should be visible again
    await expect(page.getByText(TAG_FILE_NAME)).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-14-filter-cleared.png",
    });
  });

  // ── Remove a tag from a file ─────────────────────────────────────────
  test("remove a tag from a file", async ({ page }) => {
    await loginAs(page);
    await expect(page.getByText(TAG_FILE_NAME)).toBeVisible({ timeout: 5000 });

    // Open context menu and Edit Tags
    await openFileContextMenu(page, TAG_FILE_NAME);
    await page.getByRole("menuitem", { name: /edit tags/i }).click();
    await page.waitForTimeout(500);

    // Deselect "Important" (should have a checkmark)
    const dialog = page.locator('[data-slot="dialog-content"]');
    await dialog.locator("button", { hasText: "Important" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "e2e/screenshots/tags-15-deselected-important.png",
    });

    // Save
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForTimeout(2000);

    // Verify only "Invoice" tag remains
    const fileRow = page
      .locator("div.grid", { hasText: TAG_FILE_NAME })
      .first();
    await expect(fileRow.getByText("Invoice")).toBeVisible({ timeout: 5000 });
    await expect(fileRow.getByText("Important")).not.toBeVisible();
    await page.screenshot({
      path: "e2e/screenshots/tags-16-tag-removed.png",
    });
  });

  // ── Edit a tag (rename) ──────────────────────────────────────────────
  test("rename a tag", async ({ page }) => {
    await loginAs(page);

    // Open Manage Tags
    const tagsButton = page.getByRole("button", { name: "Tags", exact: true });
    await tagsButton.click();
    await page.waitForTimeout(500);

    // Find the "Invoice" tag row and click its edit button
    const tagRow = page
      .locator('[data-slot="dialog-content"]')
      .locator("div.group", { hasText: "Invoice" })
      .first();
    await tagRow.hover();
    await page.waitForTimeout(300);

    // Click the pencil/edit button (first small button in the row)
    const editButton = tagRow.locator("button").first();
    await editButton.click();
    await page.waitForTimeout(500);

    // The edit input appears in the dialog - it's the focused input with the current tag name
    const dialog = page.locator('[data-slot="dialog-content"]');
    const editInput = dialog.locator("input").first();
    await editInput.fill("Invoices");
    await page.screenshot({
      path: "e2e/screenshots/tags-17-editing-tag.png",
    });

    // Confirm by pressing Enter
    await editInput.press("Enter");
    await page.waitForTimeout(1000);

    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Invoices"),
    ).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-18-tag-renamed.png",
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // Verify the renamed tag appears on the file row
    const fileRow = page
      .locator("div.grid", { hasText: TAG_FILE_NAME })
      .first();
    await expect(fileRow.getByText("Invoices")).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-19-renamed-tag-on-file.png",
    });
  });

  // ── Delete a tag ─────────────────────────────────────────────────────
  test("delete a tag removes it from files", async ({ page }) => {
    await loginAs(page);

    // Open Manage Tags
    const tagsButton = page.getByRole("button", { name: "Tags", exact: true });
    await tagsButton.click();
    await page.waitForTimeout(500);

    // Find the "Invoices" tag and delete it
    const tagRow = page
      .locator('[data-slot="dialog-content"]')
      .locator("div.group", { hasText: "Invoices" })
      .first();
    await tagRow.hover();
    await page.waitForTimeout(300);

    // Click the delete button (second small button in the row, after edit)
    const deleteButton = tagRow.locator("button").nth(1);
    await deleteButton.click();
    await page.waitForTimeout(1000);

    // Verify tag is gone from the dialog
    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Invoices"),
    ).not.toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: "e2e/screenshots/tags-20-tag-deleted.png",
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // Verify the tag badge is gone from the file row
    const fileRow = page
      .locator("div.grid", { hasText: TAG_FILE_NAME })
      .first();
    await expect(fileRow.getByText("Invoices")).not.toBeVisible();
    await page.screenshot({
      path: "e2e/screenshots/tags-21-tag-removed-from-file.png",
    });
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

async function loginAs(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
  await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/w\//, { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function openFileContextMenu(page: Page, fileName: string) {
  const row = page.locator("div.grid", { hasText: fileName }).first();
  await row.hover();
  await page.waitForTimeout(300);
  const menuBtn = row.locator("button").last();
  await menuBtn.click({ force: true });
  await page.waitForTimeout(300);
}
