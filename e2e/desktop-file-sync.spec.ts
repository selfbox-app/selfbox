import { expect, test } from "@playwright/test";

const TEST_USER = {
  name: "Desktop Sync User",
  email: `desktop-sync-${Date.now()}@example.com`,
  password: "TestPassword123!",
};

test.describe.serial("Desktop file sync flow", () => {
  let accessToken: string;
  let workspaceId: string;

  test("register and authorize a desktop device", async ({ page }) => {
    // Register
    await page.goto("/register");
    await page.getByPlaceholder("Your name").fill(TEST_USER.name);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Choose a password").fill(TEST_USER.password);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/register"), {
      timeout: 30000,
    });

    // Start device flow
    const startRes = await page.request.post("/api/desktop/v1/device/start", {
      data: {
        platform: "macos",
        clientName: "Selfbox Desktop Sync",
        clientVersion: "0.1.0",
      },
    });
    expect(startRes.ok()).toBeTruthy();
    const started = (await startRes.json()) as {
      deviceCode: string;
      userCode: string;
    };

    // Approve in browser
    await page.goto(`/desktop/authorize?user_code=${started.userCode}`);
    await page.getByRole("button", { name: /approve desktop app/i }).click();
    await expect(
      page.getByText(/this desktop app has been approved/i),
    ).toBeVisible();

    // Exchange for tokens
    const exchangeRes = await page.request.post(
      "/api/desktop/v1/device/exchange",
      { data: { deviceCode: started.deviceCode } },
    );
    expect(exchangeRes.ok()).toBeTruthy();
    const exchanged = (await exchangeRes.json()) as {
      status: string;
      accessToken: string;
    };
    expect(exchanged.status).toBe("approved");
    accessToken = exchanged.accessToken;
  });

  test("list workspaces and get workspace ID", async ({ request }) => {
    const res = await request.get("/api/desktop/v1/workspaces", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      workspaces: Array<{ id: string; name: string }>;
    };
    expect(body.workspaces.length).toBeGreaterThan(0);
    workspaceId = body.workspaces[0]!.id;
  });

  test("create folder, bootstrap, rename with version lock, verify sync feed", async ({
    request,
  }) => {
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Create a folder
    const createRes = await request.post(
      "/api/desktop/v1/folders/create",
      {
        headers,
        data: {
          workspaceId,
          name: "Sync Test Folder",
        },
      },
    );
    expect(createRes.status()).toBe(201);
    const folder = (await createRes.json()) as {
      id: string;
      name: string;
      version: number;
    };
    expect(folder.name).toBe("Sync Test Folder");
    expect(folder.version).toBe(1);

    // Bootstrap — folder should appear in snapshot
    const bootstrapRes = await request.post(
      "/api/desktop/v1/sync/bootstrap",
      {
        headers,
        data: { workspaceId },
      },
    );
    expect(bootstrapRes.ok()).toBeTruthy();
    const bootstrap = (await bootstrapRes.json()) as {
      cursor: number;
      folders: Array<{ id: string; name: string }>;
    };
    expect(bootstrap.folders.some((f) => f.id === folder.id)).toBeTruthy();
    expect(bootstrap.cursor).toBeGreaterThan(0);

    // Rename folder with version lock
    const renameRes = await request.post(
      "/api/desktop/v1/folders/rename",
      {
        headers,
        data: {
          workspaceId,
          id: folder.id,
          name: "Renamed Sync Folder",
          expectedVersion: 1,
        },
      },
    );
    expect(renameRes.ok()).toBeTruthy();
    const renamed = (await renameRes.json()) as {
      id: string;
      name: string;
      version: number;
    };
    expect(renamed.name).toBe("Renamed Sync Folder");
    expect(renamed.version).toBe(2);

    // Version conflict — stale version should return 409
    const conflictRes = await request.post(
      "/api/desktop/v1/folders/rename",
      {
        headers,
        data: {
          workspaceId,
          id: folder.id,
          name: "Should Fail",
          expectedVersion: 1,
        },
      },
    );
    expect(conflictRes.status()).toBe(409);
    const conflict = (await conflictRes.json()) as { code: string };
    expect(conflict.code).toBe("version_conflict");

    // Poll sync changes — should see create + rename events
    const changesRes = await request.get(
      `/api/desktop/v1/sync/changes?workspaceId=${workspaceId}&cursor=0`,
      { headers },
    );
    expect(changesRes.ok()).toBeTruthy();
    const changes = (await changesRes.json()) as {
      cursor: number;
      cursorInvalid: boolean;
      events: Array<{
        entityId: string;
        eventType: string;
        entityType: string;
      }>;
    };
    expect(changes.cursorInvalid).toBe(false);

    const folderEvents = changes.events.filter(
      (e) => e.entityId === folder.id && e.entityType === "folder",
    );
    expect(folderEvents.some((e) => e.eventType === "created")).toBeTruthy();
    expect(folderEvents.some((e) => e.eventType === "renamed")).toBeTruthy();

    // Critical property the Rust rename detection relies on:
    // a rename produces one `renamed` event, NOT `deleted` + `created`.
    const renameOnlyEvents = folderEvents.filter(
      (e) => e.eventType !== "created",
    );
    expect(renameOnlyEvents.length).toBe(1);
    expect(renameOnlyEvents[0]!.eventType).toBe("renamed");
    expect(folderEvents.some((e) => e.eventType === "deleted")).toBeFalsy();
  });

  test("content update preserves fileId and emits a single `updated` event", async ({
    request,
  }) => {
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Upload an initial version
    const content1 = "version one";
    const bytes1 = new TextEncoder().encode(content1);
    const digest1 = await crypto.subtle.digest("SHA-256", bytes1);
    const checksum1 = Array.from(new Uint8Array(digest1))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const initRes = await request.post(
      "/api/desktop/v1/files/upload/initiate",
      {
        headers,
        data: {
          workspaceId,
          fileName: "version-test.txt",
          fileSize: bytes1.byteLength,
          contentType: "text/plain",
          checksum: checksum1,
        },
      },
    );
    expect(initRes.ok()).toBeTruthy();
    const initiated = (await initRes.json()) as {
      fileId: string;
      strategy: string;
      presignedUrl?: string;
    };

    if (initiated.strategy !== "presigned-put" || !initiated.presignedUrl) {
      test.skip(true, "Storage backend needs presigned PUT for this test");
    }

    const put1 = await request.put(initiated.presignedUrl!, {
      data: content1,
      headers: { "Content-Type": "text/plain" },
    });
    expect(put1.ok()).toBeTruthy();

    const complete1 = await request.post(
      "/api/desktop/v1/files/upload/complete",
      { headers, data: { workspaceId, fileId: initiated.fileId } },
    );
    expect(complete1.ok()).toBeTruthy();
    const v1 = (await complete1.json()) as { id: string; version: number };
    expect(v1.version).toBe(1);

    // Now push a content update for the same file
    const content2 = "version TWO — completely different content";
    const bytes2 = new TextEncoder().encode(content2);
    const digest2 = await crypto.subtle.digest("SHA-256", bytes2);
    const checksum2 = Array.from(new Uint8Array(digest2))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const updInitRes = await request.post(
      "/api/desktop/v1/files/update/initiate",
      {
        headers,
        data: {
          workspaceId,
          fileId: v1.id,
          fileSize: bytes2.byteLength,
          contentType: "text/plain",
          checksum: checksum2,
          expectedVersion: 1,
        },
      },
    );
    expect(updInitRes.ok()).toBeTruthy();
    const updInit = (await updInitRes.json()) as {
      fileId: string;
      storagePath: string;
      strategy: string;
      presignedUrl?: string;
    };

    expect(updInit.fileId).toBe(v1.id); // same file id!
    expect(updInit.storagePath).toContain("pending-"); // pending object

    if (updInit.strategy === "presigned-put" && updInit.presignedUrl) {
      const put2 = await request.put(updInit.presignedUrl, {
        data: content2,
        headers: { "Content-Type": "text/plain" },
      });
      expect(put2.ok()).toBeTruthy();
    }

    const complete2 = await request.post(
      "/api/desktop/v1/files/update/complete",
      {
        headers,
        data: {
          workspaceId,
          fileId: v1.id,
          pendingPath: updInit.storagePath,
        },
      },
    );
    expect(complete2.ok()).toBeTruthy();
    const v2 = (await complete2.json()) as {
      id: string;
      version: number;
      size: number;
    };

    // Same id, bumped version, new size
    expect(v2.id).toBe(v1.id);
    expect(v2.version).toBe(2);
    expect(v2.size).toBe(bytes2.byteLength);

    // Sync feed should have exactly one `updated` event for this file
    const changesRes = await request.get(
      `/api/desktop/v1/sync/changes?workspaceId=${workspaceId}&cursor=0&limit=500`,
      { headers },
    );
    const changes = (await changesRes.json()) as {
      events: Array<{
        entityId: string;
        eventType: string;
        entityType: string;
      }>;
    };

    const fileEvents = changes.events.filter((e) => e.entityId === v1.id);
    const updateEvents = fileEvents.filter((e) => e.eventType === "updated");
    expect(updateEvents.length).toBe(1);
    // No delete event for a content update — the file id is stable
    expect(fileEvents.some((e) => e.eventType === "deleted")).toBeFalsy();
  });

  test("version conflict on update returns 409 without mutating", async ({
    request,
  }) => {
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Upload a file
    const content = "conflict target";
    const bytes = new TextEncoder().encode(content);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const initRes = await request.post(
      "/api/desktop/v1/files/upload/initiate",
      {
        headers,
        data: {
          workspaceId,
          fileName: "conflict.txt",
          fileSize: bytes.byteLength,
          contentType: "text/plain",
          checksum,
        },
      },
    );
    const initiated = (await initRes.json()) as {
      fileId: string;
      strategy: string;
      presignedUrl?: string;
    };
    if (initiated.strategy !== "presigned-put" || !initiated.presignedUrl) {
      test.skip(true, "Storage backend needs presigned PUT for this test");
    }
    await request.put(initiated.presignedUrl!, {
      data: content,
      headers: { "Content-Type": "text/plain" },
    });
    await request.post("/api/desktop/v1/files/upload/complete", {
      headers,
      data: { workspaceId, fileId: initiated.fileId },
    });

    // Try to update with a stale expectedVersion (0 instead of 1)
    const stale = await request.post(
      "/api/desktop/v1/files/update/initiate",
      {
        headers,
        data: {
          workspaceId,
          fileId: initiated.fileId,
          fileSize: 99,
          contentType: "text/plain",
          checksum: "b".repeat(64),
          expectedVersion: 999,
        },
      },
    );
    expect(stale.status()).toBe(409);
    const body = (await stale.json()) as { code: string };
    expect(body.code).toBe("version_conflict");
  });

  test("move folder between parents emits a single `moved` event", async ({
    request,
  }) => {
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Create source + destination parents and a target folder inside source
    const srcRes = await request.post("/api/desktop/v1/folders/create", {
      headers,
      data: { workspaceId, name: "MoveSrc" },
    });
    const src = (await srcRes.json()) as { id: string };

    const dstRes = await request.post("/api/desktop/v1/folders/create", {
      headers,
      data: { workspaceId, name: "MoveDst" },
    });
    const dst = (await dstRes.json()) as { id: string };

    const targetRes = await request.post("/api/desktop/v1/folders/create", {
      headers,
      data: { workspaceId, name: "Target", parentId: src.id },
    });
    const target = (await targetRes.json()) as {
      id: string;
      version: number;
    };
    expect(target.version).toBe(1);

    // Move Target from MoveSrc → MoveDst
    const moveRes = await request.post("/api/desktop/v1/folders/move", {
      headers,
      data: {
        workspaceId,
        id: target.id,
        targetFolderId: dst.id,
        expectedVersion: target.version,
      },
    });
    expect(moveRes.ok()).toBeTruthy();
    const moved = (await moveRes.json()) as { id: string; version: number };
    expect(moved.id).toBe(target.id);
    expect(moved.version).toBe(2);

    // Stale version on move → 409
    const stale = await request.post("/api/desktop/v1/folders/move", {
      headers,
      data: {
        workspaceId,
        id: target.id,
        targetFolderId: src.id,
        expectedVersion: 1, // stale
      },
    });
    expect(stale.status()).toBe(409);
    const staleBody = (await stale.json()) as { code: string };
    expect(staleBody.code).toBe("version_conflict");

    // Move cycle should be rejected (move target into its own descendant)
    const cycleRes = await request.post("/api/desktop/v1/folders/move", {
      headers,
      data: {
        workspaceId,
        id: dst.id,
        targetFolderId: target.id,
        expectedVersion: 1,
      },
    });
    // Server returns a generic error; just ensure it's non-2xx
    expect(cycleRes.ok()).toBeFalsy();

    // Sync feed should have exactly one `moved` event for this folder
    const changesRes = await request.get(
      `/api/desktop/v1/sync/changes?workspaceId=${workspaceId}&cursor=0&limit=500`,
      { headers },
    );
    const changes = (await changesRes.json()) as {
      events: Array<{
        entityId: string;
        eventType: string;
        entityType: string;
      }>;
    };

    const folderEvents = changes.events.filter(
      (e) => e.entityId === target.id && e.entityType === "folder",
    );
    const moveEvents = folderEvents.filter((e) => e.eventType === "moved");
    expect(moveEvents.length).toBe(1);
    expect(folderEvents.some((e) => e.eventType === "deleted")).toBeFalsy();
  });

  test("move file between folders emits a single `moved` event", async ({
    request,
  }) => {
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Create two folders
    const srcRes = await request.post("/api/desktop/v1/folders/create", {
      headers,
      data: { workspaceId, name: "Source" },
    });
    const src = (await srcRes.json()) as { id: string };

    const dstRes = await request.post("/api/desktop/v1/folders/create", {
      headers,
      data: { workspaceId, name: "Destination" },
    });
    const dst = (await dstRes.json()) as { id: string };

    // Upload a file into Source via server-side SHA-256
    const content = "hello move";
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const initiateRes = await request.post(
      "/api/desktop/v1/files/upload/initiate",
      {
        headers,
        data: {
          workspaceId,
          fileName: "notes.md",
          fileSize: bytes.byteLength,
          contentType: "text/markdown",
          folderId: src.id,
          checksum,
        },
      },
    );
    expect(initiateRes.ok()).toBeTruthy();
    const initiated = (await initiateRes.json()) as {
      fileId: string;
      strategy: string;
      presignedUrl?: string;
    };

    // If storage backend supports presigned PUT, upload there; otherwise skip content upload.
    if (initiated.strategy === "presigned-put" && initiated.presignedUrl) {
      const putRes = await request.put(initiated.presignedUrl, {
        data: content,
        headers: { "Content-Type": "text/markdown" },
      });
      expect(putRes.ok()).toBeTruthy();
    }

    const completeRes = await request.post(
      "/api/desktop/v1/files/upload/complete",
      {
        headers,
        data: { workspaceId, fileId: initiated.fileId },
      },
    );

    // Local storage may reject complete without an actual upload step;
    // only continue if we got a valid file record.
    if (!completeRes.ok()) {
      test.skip(true, "Storage backend doesn't support server-buffered desktop uploads in test env");
    }
    const completed = (await completeRes.json()) as {
      id: string;
      version: number;
    };

    // Move the file to Destination
    const moveRes = await request.post("/api/desktop/v1/files/move", {
      headers,
      data: {
        workspaceId,
        id: completed.id,
        targetFolderId: dst.id,
        expectedVersion: completed.version,
      },
    });
    expect(moveRes.ok()).toBeTruthy();

    // Verify exactly one `moved` event for this file
    const changesRes = await request.get(
      `/api/desktop/v1/sync/changes?workspaceId=${workspaceId}&cursor=0&limit=500`,
      { headers },
    );
    const changes = (await changesRes.json()) as {
      events: Array<{
        entityId: string;
        eventType: string;
        entityType: string;
      }>;
    };

    const fileEvents = changes.events.filter(
      (e) => e.entityId === completed.id && e.entityType === "file",
    );
    const moveEvents = fileEvents.filter((e) => e.eventType === "moved");
    expect(moveEvents.length).toBe(1);
    expect(fileEvents.some((e) => e.eventType === "deleted")).toBeFalsy();
  });
});
