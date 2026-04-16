import { expect, test } from "@playwright/test";

const TEST_USER = {
  name: "Desktop Device User",
  email: `desktop-device-${Date.now()}@example.com`,
  password: "TestPassword123!",
};

test.describe.serial("Desktop device flow", () => {
  test("authorizes a desktop device and lists workspaces with bearer auth", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.getByPlaceholder("Your name").fill(TEST_USER.name);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Choose a password").fill(TEST_USER.password);
    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL((url) => !url.pathname.includes("/register"), {
      timeout: 30000,
    });

    const startResponse = await page.request.post("/api/desktop/v1/device/start", {
      data: {
        platform: "macos",
        clientName: "Selfbox Desktop Sync",
        clientVersion: "0.1.0",
      },
    });
    expect(startResponse.ok()).toBeTruthy();

    const started = (await startResponse.json()) as {
      deviceCode: string;
      userCode: string;
    };

    await page.goto(`/desktop/authorize?user_code=${started.userCode}`);
    await page.getByRole("button", { name: /approve desktop app/i }).click();
    await expect(
      page.getByText(/this desktop app has been approved/i),
    ).toBeVisible();

    const exchangeResponse = await page.request.post(
      "/api/desktop/v1/device/exchange",
      {
        data: {
          deviceCode: started.deviceCode,
        },
      },
    );

    expect(exchangeResponse.ok()).toBeTruthy();
    const exchanged = (await exchangeResponse.json()) as {
      status: string;
      accessToken: string;
    };
    expect(exchanged.status).toBe("approved");

    const workspacesResponse = await page.request.get(
      "/api/desktop/v1/workspaces",
      {
        headers: {
          Authorization: `Bearer ${exchanged.accessToken}`,
        },
      },
    );

    expect(workspacesResponse.ok()).toBeTruthy();
    const workspacePayload = (await workspacesResponse.json()) as {
      workspaces: Array<{ name: string }>;
    };
    expect(Array.isArray(workspacePayload.workspaces)).toBeTruthy();
  });
});
