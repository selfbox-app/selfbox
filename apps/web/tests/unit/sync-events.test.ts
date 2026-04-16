import { describe, expect, it } from "vitest";
import { createFileSyncPayload, createFolderSyncPayload } from "@/server/desktop/sync-events";

describe("sync payload builders", () => {
  it("serializes file metadata for sync feeds", () => {
    const payload = createFileSyncPayload({
      id: "file-1",
      workspaceId: "ws-1",
      userId: "user-1",
      folderId: "folder-1",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: 42,
      storagePath: "ws-1/file-1/report.pdf",
      storageProvider: "local",
      status: "ready",
      version: 3,
      thumbnailPath: null,
      checksum: "abc123",
      storageConfigId: null,
      s3Key: null,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T01:00:00.000Z"),
    });

    expect(payload).toMatchObject({
      id: "file-1",
      folderId: "folder-1",
      version: 3,
      checksum: "abc123",
      status: "ready",
    });
    expect(payload.updatedAt).toBe("2026-04-11T01:00:00.000Z");
  });

  it("serializes folder metadata for sync feeds", () => {
    const payload = createFolderSyncPayload({
      id: "folder-1",
      workspaceId: "ws-1",
      userId: "user-1",
      parentId: null,
      name: "Projects",
      color: null,
      version: 2,
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    expect(payload).toMatchObject({
      id: "folder-1",
      name: "Projects",
      version: 2,
    });
    expect(payload.createdAt).toBe("2026-04-10T00:00:00.000Z");
  });
});
