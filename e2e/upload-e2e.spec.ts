import { test, expect, type Page } from "@playwright/test";

const TEST_USER = {
  name: "Upload Test User",
  email: `upload-test-${Date.now()}@example.com`,
  password: "TestPassword123!",
};

let workspaceSlug = "";

// ── Helpers ───────────────────────────────────────────────────────────────

async function register(page: Page) {
  await page.goto("/register");
  await page.getByPlaceholder("Your name").fill(TEST_USER.name);
  await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
  await page.getByPlaceholder("Choose a password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /create account/i }).click();

  // Registration redirects to /onboarding
  await page.waitForURL("**/onboarding", { timeout: 15_000 });
}

async function onboard(page: Page) {
  // The onboarding page asks for a workspace name (placeholder: "e.g. Acme Inc")
  await page.getByPlaceholder(/acme/i).fill("Test Workspace");
  await page.getByRole("button", { name: /create workspace/i }).click();

  // Onboarding redirects to /w/[slug]
  await page.waitForURL("**/w/**", { timeout: 15_000 });
  workspaceSlug = page.url().split("/w/")[1]?.split("/")[0] ?? "";
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
  await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Login redirects to / then to /w/[slug] — wait for dashboard content
  // as the URL redirect can be slow on dev server
  await page.waitForURL("**/w/**", { timeout: 30_000 });
  await page.getByText("My Files").waitFor({ timeout: 10_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe.serial("Upload E2E", () => {
  test("register and onboard", async ({ page }) => {
    await register(page);
    await page.screenshot({ path: "e2e/screenshots/upload-01-onboarding.png" });
    await onboard(page);
    await page.screenshot({ path: "e2e/screenshots/upload-02-dashboard.png" });
    await expect(page.getByText("My Files")).toBeVisible({ timeout: 10_000 });
  });

  test("upload a small text file via the dialog", async ({ page }) => {
    // Collect errors from all sources
    const serverErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("response", async (resp) => {
      if (resp.status() >= 400) {
        let body = "";
        try {
          body = await resp.text();
        } catch {}
        serverErrors.push(
          `${resp.status()} ${resp.url()} ${body.slice(0, 500)}`,
        );
      }
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await login(page);
    await page.screenshot({ path: "e2e/screenshots/upload-03-logged-in.png" });

    // Open upload dialog
    await page
      .getByRole("button", { name: /^upload$/i })
      .first()
      .click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "e2e/screenshots/upload-04-dialog-open.png",
    });

    // Select a file
    const fileInput = page.locator(
      '[data-slot="dialog-content"] input[type="file"]',
    );
    const fileContent = "Hello from Playwright upload test! " + Date.now();
    await fileInput.setInputFiles({
      name: "playwright-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(fileContent),
    });

    await page.waitForTimeout(500);
    await page.screenshot({
      path: "e2e/screenshots/upload-05-file-selected.png",
    });

    // Click upload button
    await page.getByRole("button", { name: /upload 1 file/i }).click();

    // Wait for upload to finish
    await page.waitForTimeout(8000);
    await page.screenshot({
      path: "e2e/screenshots/upload-06-upload-result.png",
    });

    // Dump all captured errors for debugging
    if (serverErrors.length > 0) {
      console.log("HTTP errors:", JSON.stringify(serverErrors, null, 2));
    }
    if (consoleErrors.length > 0) {
      console.log("Console errors:", JSON.stringify(consoleErrors, null, 2));
    }

    // Fail on 500s
    const fiveHundreds = serverErrors.filter((e) => e.startsWith("5"));
    expect(fiveHundreds, "No 500 errors during upload").toHaveLength(0);

    // Close the dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // Verify file appears in the file list
    await expect(page.getByText("playwright-test.txt")).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: "e2e/screenshots/upload-07-file-in-list.png",
    });
  });

  test("download the uploaded file", async ({ page, context }) => {
    await login(page);
    await expect(page.getByText("playwright-test.txt")).toBeVisible({
      timeout: 10_000,
    });

    // Open context menu
    const row = page
      .locator("div.grid", { hasText: "playwright-test.txt" })
      .first();
    await row.hover();
    await page.waitForTimeout(300);
    const menuBtn = row.locator("button").last();
    await menuBtn.click({ force: true });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "e2e/screenshots/upload-08-context-menu.png",
    });

    // Click download — may trigger a download event or open in a new tab
    // depending on content-type. Handle both cases.
    const [downloadOrPage] = await Promise.all([
      Promise.race([
        page.waitForEvent("download", { timeout: 10_000 }).then((d) => ({
          type: "download" as const,
          download: d,
        })),
        context.waitForEvent("page", { timeout: 10_000 }).then((p) => ({
          type: "page" as const,
          newPage: p,
        })),
        page
          .waitForURL(/s3\..*amazonaws|blob\.vercel|localhost.*serve/, {
            timeout: 10_000,
          })
          .then(() => ({ type: "navigated" as const })),
      ]),
      page.getByRole("menuitem", { name: /download/i }).click(),
    ]);

    if (downloadOrPage.type === "download") {
      const download = downloadOrPage.download;
      expect(download.suggestedFilename()).toBe("playwright-test.txt");
      const downloadPath = await download.path();
      const fs = await import("fs");
      const content = fs.readFileSync(downloadPath!, "utf-8");
      expect(content).toContain("Hello from Playwright upload test!");
    } else if (downloadOrPage.type === "page") {
      // Opened in a new tab — read content from the new page
      const newPage = downloadOrPage.newPage;
      await newPage.waitForLoadState("domcontentloaded");
      const content = await newPage.textContent("body");
      expect(content).toContain("Hello from Playwright upload test!");
      await newPage.close();
    } else {
      // Navigated in the same page — the file content is displayed inline
      const content = await page.textContent("body");
      expect(content).toContain("Hello from Playwright upload test!");
    }

    await page.screenshot({
      path: "e2e/screenshots/upload-09-download-verified.png",
    });
  });

  test("delete the uploaded file", async ({ page }) => {
    await login(page);
    await expect(page.getByText("playwright-test.txt")).toBeVisible({
      timeout: 10_000,
    });

    // Open context menu
    const row = page
      .locator("div.grid", { hasText: "playwright-test.txt" })
      .first();
    await row.hover();
    await page.waitForTimeout(300);
    const menuBtn = row.locator("button").last();
    await menuBtn.click({ force: true });
    await page.waitForTimeout(300);

    // Delete
    await page.getByRole("menuitem", { name: /delete/i }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: "e2e/screenshots/upload-10-after-delete.png",
    });

    // Verify the file is gone
    await expect(page.getByText("playwright-test.txt")).not.toBeVisible({
      timeout: 5000,
    });
  });
});
