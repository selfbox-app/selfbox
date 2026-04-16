import { randomUUID } from "crypto";
import { and, eq, sql, asc } from "drizzle-orm";
import { files, folders, workspaces } from "@selfbox/database";
import type { Database } from "@selfbox/database";
import { MULTIPART_THRESHOLD, MULTIPART_PART_SIZE } from "@selfbox/common";
import {
  createStorageForWorkspace,
  createStorageForFile,
  shouldEnforceQuota,
} from "../storage";
import {
  createFileSyncPayload,
  createFolderSyncPayload,
  recordWorkspaceSyncEvent,
} from "./sync-events";
import { sha256ReadableStream } from "./checksum";
import { requireWorkspaceMembership } from "./sync";
import {
  DesktopVersionConflictError,
  DesktopChecksumMismatchError,
} from "./http";
import { qmdClient, streamToString } from "../plugins/handlers/qmd-client";
import { ftsClient } from "../plugins/handlers/fts-client";
import { resolvePluginEndpoint } from "../plugins/resolve-endpoint";
import { isTextIndexable, transcribeFile } from "../plugins/transcription";
import { logFireAndForget } from "@/lib/log";

// ── Folder mutations ──────────────────────────────────────────────────────

export async function desktopCreateFolder(
  db: Database,
  input: {
    workspaceId: string;
    name: string;
    parentId?: string | null;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  if (input.parentId) {
    const [parent] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, input.parentId),
          eq(folders.workspaceId, input.workspaceId),
        ),
      );
    if (!parent) throw new Error("Parent folder not found");
  }

  const [folder] = await db
    .insert(folders)
    .values({
      userId: input.actorUserId,
      workspaceId: input.workspaceId,
      parentId: input.parentId ?? null,
      name: input.name,
    })
    .returning();

  await recordWorkspaceSyncEvent(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDeviceId: input.actorDeviceId,
    entityType: "folder",
    entityId: folder!.id,
    eventType: "created",
    payload: createFolderSyncPayload(folder!),
  });

  return folder!;
}

export async function desktopRenameFolder(
  db: Database,
  input: {
    workspaceId: string;
    id: string;
    name: string;
    expectedVersion: number;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [updated] = await db
    .update(folders)
    .set({
      name: input.name,
      version: sql`${folders.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(folders.id, input.id),
        eq(folders.workspaceId, input.workspaceId),
        eq(folders.version, input.expectedVersion),
      ),
    )
    .returning();

  if (!updated) {
    await throwVersionConflict(db, "folder", input.id, input.workspaceId);
  }

  await recordWorkspaceSyncEvent(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDeviceId: input.actorDeviceId,
    entityType: "folder",
    entityId: updated!.id,
    eventType: "renamed",
    payload: createFolderSyncPayload(updated!),
  });

  return updated!;
}

export async function desktopMoveFolder(
  db: Database,
  input: {
    workspaceId: string;
    id: string;
    targetFolderId: string | null;
    expectedVersion: number;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  // Validate target folder and prevent ancestor cycle
  if (input.targetFolderId) {
    const [target] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, input.targetFolderId),
          eq(folders.workspaceId, input.workspaceId),
        ),
      );
    if (!target) throw new Error("Target folder not found");

    let currentId: string | null = input.targetFolderId;
    while (currentId) {
      if (currentId === input.id) {
        throw new Error("Cannot move a folder into itself or its subfolder");
      }
      const [parent] = await db
        .select({ parentId: folders.parentId })
        .from(folders)
        .where(
          and(
            eq(folders.id, currentId),
            eq(folders.workspaceId, input.workspaceId),
          ),
        );
      currentId = parent?.parentId ?? null;
    }
  }

  const [updated] = await db
    .update(folders)
    .set({
      parentId: input.targetFolderId,
      version: sql`${folders.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(folders.id, input.id),
        eq(folders.workspaceId, input.workspaceId),
        eq(folders.version, input.expectedVersion),
      ),
    )
    .returning();

  if (!updated) {
    await throwVersionConflict(db, "folder", input.id, input.workspaceId);
  }

  await recordWorkspaceSyncEvent(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDeviceId: input.actorDeviceId,
    entityType: "folder",
    entityId: updated!.id,
    eventType: "moved",
    payload: createFolderSyncPayload(updated!),
  });

  return updated!;
}

export async function desktopDeleteFolder(
  db: Database,
  input: {
    workspaceId: string;
    id: string;
    expectedVersion: number;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [folder] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, input.id),
        eq(folders.workspaceId, input.workspaceId),
        eq(folders.version, input.expectedVersion),
      ),
    );

  if (!folder) {
    await throwVersionConflict(db, "folder", input.id, input.workspaceId);
  }

  await subtreeDeleteFolder(
    db,
    input.workspaceId,
    input.id,
    input.actorUserId,
    input.actorDeviceId,
  );

  return { success: true };
}

// ── File mutations ────────────────────────────────────────────────────────

export async function desktopInitiateUpload(
  db: Database,
  input: {
    workspaceId: string;
    fileName: string;
    fileSize: number;
    contentType: string;
    folderId?: string | null;
    checksum: string;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  // Check storage quota
  if (await shouldEnforceQuota(input.workspaceId)) {
    const [ws] = await db
      .select({
        storageUsed: workspaces.storageUsed,
        storageLimit: workspaces.storageLimit,
      })
      .from(workspaces)
      .where(eq(workspaces.id, input.workspaceId));

    if (
      !ws ||
      (ws.storageUsed ?? 0) + input.fileSize > (ws.storageLimit ?? 0)
    ) {
      throw new Error("Storage quota exceeded");
    }
  }

  // Validate folder
  if (input.folderId) {
    const [folder] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, input.folderId),
          eq(folders.workspaceId, input.workspaceId),
        ),
      );
    if (!folder) throw new Error("Folder not found");
  }

  const fileId = randomUUID();
  const storagePath = `${input.workspaceId}/${fileId}/${input.fileName}`;
  const { storage, configId, providerName } = await createStorageForWorkspace(
    input.workspaceId,
  );

  await db.insert(files).values({
    id: fileId,
    workspaceId: input.workspaceId,
    userId: input.actorUserId,
    folderId: input.folderId ?? null,
    name: input.fileName,
    mimeType: input.contentType,
    size: input.fileSize,
    storagePath,
    storageProvider: providerName,
    storageConfigId: configId,
    checksum: input.checksum,
    status: "uploading",
  });

  if (!storage.supportsPresignedUpload) {
    return { fileId, storagePath, strategy: "server-buffered" as const };
  }

  if (input.fileSize < MULTIPART_THRESHOLD) {
    const { url } = await storage.createPresignedUpload!({
      path: storagePath,
      contentType: input.contentType,
      size: input.fileSize,
    });
    return {
      fileId,
      storagePath,
      strategy: "presigned-put" as const,
      presignedUrl: url,
    };
  }

  const partCount = Math.ceil(input.fileSize / MULTIPART_PART_SIZE);
  const { uploadId } = await storage.createMultipartUpload!({
    path: storagePath,
    contentType: input.contentType,
  });
  const { urls } = await storage.getMultipartPartUrls!({
    path: storagePath,
    uploadId,
    parts: partCount,
  });

  return {
    fileId,
    storagePath,
    strategy: "multipart" as const,
    uploadId,
    partSize: MULTIPART_PART_SIZE,
    parts: urls,
  };
}

/**
 * Initiate a content update for an existing file.
 *
 * Unlike `desktopInitiateUpload` (which creates a new file record), this
 * reuses the same file id/row and prepares a fresh upload to a temporary
 * storage path. The real swap happens in `desktopCompleteUpdate` after
 * the checksum is verified.
 */
export async function desktopInitiateUpdate(
  db: Database,
  input: {
    workspaceId: string;
    fileId: string;
    fileSize: number;
    contentType: string;
    checksum: string;
    expectedVersion: number;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.workspaceId, input.workspaceId),
      ),
    );

  if (!file) throw new Error("File not found");
  if (file.version !== input.expectedVersion) {
    throw new DesktopVersionConflictError(file.id, file.version);
  }

  // Quota check for the NEW size minus the OLD size
  if (await shouldEnforceQuota(input.workspaceId)) {
    const delta = input.fileSize - file.size;
    if (delta > 0) {
      const [ws] = await db
        .select({
          storageUsed: workspaces.storageUsed,
          storageLimit: workspaces.storageLimit,
        })
        .from(workspaces)
        .where(eq(workspaces.id, input.workspaceId));

      if (!ws || (ws.storageUsed ?? 0) + delta > (ws.storageLimit ?? 0)) {
        throw new Error("Storage quota exceeded");
      }
    }
  }

  // Upload to a versioned temp path so we don't trash the live file
  // if the new upload never completes.
  const pendingPath = `${input.workspaceId}/${input.fileId}/pending-${randomUUID()}`;
  const { storage } = await createStorageForWorkspace(input.workspaceId);

  // Stash the pending metadata on the row so complete can find it.
  // We abuse the `status` field to indicate "updating" so complete knows
  // to swap content rather than treat this as a fresh upload.
  await db
    .update(files)
    .set({
      status: "updating",
      updatedAt: new Date(),
    })
    .where(eq(files.id, input.fileId));

  // We need to remember: the claimed checksum, the new size, the new
  // content-type, and the pending storage path. We store a JSON blob
  // in the existing `storagePath` column's sibling... but we don't want
  // to clobber the real storagePath. Best approach: put the pending info
  // in a side-channel we already have — reuse `checksum` as a carrier
  // for the claimed new checksum (valid since the old content still lives
  // at the real storagePath until we swap).
  //
  // Simpler: set checksum to the claimed value and store pendingPath in
  // a conventional location we can reconstruct. Since we have a single
  // "pending-*" prefix, complete will scan for files by fileId and pick
  // up the pending object.
  await db
    .update(files)
    .set({ checksum: input.checksum })
    .where(eq(files.id, input.fileId));

  if (!storage.supportsPresignedUpload) {
    return { fileId: input.fileId, storagePath: pendingPath, strategy: "server-buffered" as const };
  }

  if (input.fileSize < MULTIPART_THRESHOLD) {
    const { url } = await storage.createPresignedUpload!({
      path: pendingPath,
      contentType: input.contentType,
      size: input.fileSize,
    });
    return {
      fileId: input.fileId,
      storagePath: pendingPath,
      strategy: "presigned-put" as const,
      presignedUrl: url,
    };
  }

  const partCount = Math.ceil(input.fileSize / MULTIPART_PART_SIZE);
  const { uploadId } = await storage.createMultipartUpload!({
    path: pendingPath,
    contentType: input.contentType,
  });
  const { urls } = await storage.getMultipartPartUrls!({
    path: pendingPath,
    uploadId,
    parts: partCount,
  });

  return {
    fileId: input.fileId,
    storagePath: pendingPath,
    strategy: "multipart" as const,
    uploadId,
    partSize: MULTIPART_PART_SIZE,
    parts: urls,
  };
}

/**
 * Complete a content update: verify checksum of pending object, swap it
 * for the live storage path (deleting old bytes), bump version, record
 * `updated` sync event.
 */
export async function desktopCompleteUpdate(
  db: Database,
  input: {
    workspaceId: string;
    fileId: string;
    pendingPath: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.workspaceId, input.workspaceId),
        eq(files.status, "updating"),
      ),
    );

  if (!file) throw new Error("Update not in progress for this file");

  const storage = await createStorageForFile(file.storageConfigId);

  // Complete multipart if applicable
  if (input.uploadId && input.parts) {
    await storage.completeMultipartUpload!({
      path: input.pendingPath,
      uploadId: input.uploadId,
      parts: input.parts,
    });
  }

  // Verify the pending object's checksum matches the claim
  const download = await storage.download(input.pendingPath);
  const actualChecksum = await sha256ReadableStream(download.data);

  if (file.checksum && actualChecksum !== file.checksum) {
    try {
      await storage.delete(input.pendingPath);
    } catch {}
    // Roll back status so the row is usable again
    await db
      .update(files)
      .set({ status: "ready" })
      .where(eq(files.id, input.fileId));
    throw new DesktopChecksumMismatchError(
      input.fileId,
      file.checksum,
      actualChecksum,
    );
  }

  // Get new size from the pending object
  const newDownload = await storage.download(input.pendingPath);
  let newSize = 0;
  const reader = newDownload.data.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    newSize += value?.byteLength ?? 0;
  }

  // Delete old content, then move pending → live path.
  try {
    await storage.delete(file.storagePath);
  } catch {}

  // Copy pending to live path: simplest is to re-upload or rename.
  // If storage supports copy we'd use it; most providers support server-side
  // copy but the StorageProvider interface doesn't expose it. Instead, we
  // just update the file row to point to the pending path and leave it.
  const oldSize = file.size;

  const [updated] = await db
    .update(files)
    .set({
      storagePath: input.pendingPath,
      size: newSize,
      version: sql`${files.version} + 1`,
      status: "ready",
      updatedAt: new Date(),
    })
    .where(eq(files.id, input.fileId))
    .returning();

  if (updated) {
    await recordWorkspaceSyncEvent(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actorDeviceId: input.actorDeviceId,
      entityType: "file",
      entityId: updated.id,
      eventType: "updated",
      payload: createFileSyncPayload(updated),
    });
  }

  // Adjust storage usage by the delta
  const delta = newSize - oldSize;
  if (delta !== 0) {
    await db
      .update(workspaces)
      .set({
        storageUsed: sql`GREATEST(${workspaces.storageUsed} + ${delta}, 0)`,
      })
      .where(eq(workspaces.id, input.workspaceId));
  }

  // Re-index + re-transcribe with the new content
  void indexFileForSearch(db, input.workspaceId, updated!, storage);
  if (!isTextIndexable(file.mimeType)) {
    void transcribeFile({
      db,
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      fileId: input.fileId,
      fileName: file.name,
      mimeType: file.mimeType,
      storagePath: input.pendingPath,
      storageConfigId: file.storageConfigId,
    }).catch(
      logFireAndForget("transcription", {
        fileId: input.fileId,
        workspaceId: input.workspaceId,
      }),
    );
  }

  return updated!;
}

export async function desktopCompleteUpload(
  db: Database,
  input: {
    workspaceId: string;
    fileId: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.workspaceId, input.workspaceId),
        eq(files.status, "uploading"),
      ),
    );

  if (!file) throw new Error("Upload not found");

  // Complete multipart if applicable
  if (input.uploadId && input.parts) {
    const storage = await createStorageForFile(file.storageConfigId);
    await storage.completeMultipartUpload!({
      path: file.storagePath,
      uploadId: input.uploadId,
      parts: input.parts,
    });
  }

  // Verify checksum
  const storage = await createStorageForFile(file.storageConfigId);
  const download = await storage.download(file.storagePath);
  const actualChecksum = await sha256ReadableStream(download.data);

  if (file.checksum && actualChecksum !== file.checksum) {
    // Clean up uploaded data
    try {
      await storage.delete(file.storagePath);
    } catch {}
    await db.delete(files).where(eq(files.id, input.fileId));
    throw new DesktopChecksumMismatchError(
      input.fileId,
      file.checksum,
      actualChecksum,
    );
  }

  // Mark as ready
  const [updated] = await db
    .update(files)
    .set({ status: "ready", checksum: actualChecksum, updatedAt: new Date() })
    .where(eq(files.id, input.fileId))
    .returning();

  if (updated) {
    await recordWorkspaceSyncEvent(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actorDeviceId: input.actorDeviceId,
      entityType: "file",
      entityId: updated.id,
      eventType: "created",
      payload: createFileSyncPayload(updated),
    });
  }

  // Update storage usage
  await db
    .update(workspaces)
    .set({ storageUsed: sql`${workspaces.storageUsed} + ${file.size}` })
    .where(eq(workspaces.id, input.workspaceId));

  // Fire-and-forget: search indexing
  void indexFileForSearch(db, input.workspaceId, file, storage);

  // Fire-and-forget: transcription
  if (!isTextIndexable(file.mimeType)) {
    void transcribeFile({
      db,
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      fileId: input.fileId,
      fileName: file.name,
      mimeType: file.mimeType,
      storagePath: file.storagePath,
      storageConfigId: file.storageConfigId,
    }).catch(
      logFireAndForget("transcription", {
        fileId: input.fileId,
        workspaceId: input.workspaceId,
      }),
    );
  }

  return updated!;
}

export async function desktopGetDownloadUrl(
  db: Database,
  input: {
    workspaceId: string;
    fileId: string;
    actorUserId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.workspaceId, input.workspaceId),
      ),
    );

  if (!file) throw new Error("File not found");

  const storage = await createStorageForFile(file.storageConfigId);
  const url = await storage.getSignedUrl(file.storagePath, 3600);

  return {
    url,
    filename: file.name,
    mimeType: file.mimeType,
    checksum: file.checksum,
    version: file.version,
    size: file.size,
  };
}

/**
 * Fetch a single file's current server state as a sync payload. Used by the
 * desktop client after a version_conflict to re-sync authoritative state
 * without waiting for the next change-feed poll.
 */
export async function desktopGetFile(
  db: Database,
  input: {
    workspaceId: string;
    fileId: string;
    actorUserId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.workspaceId, input.workspaceId),
      ),
    );

  if (!file) throw new Error("File not found");

  return createFileSyncPayload(file);
}

export async function desktopRenameFile(
  db: Database,
  input: {
    workspaceId: string;
    id: string;
    name: string;
    expectedVersion: number;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [updated] = await db
    .update(files)
    .set({
      name: input.name,
      version: sql`${files.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(files.id, input.id),
        eq(files.workspaceId, input.workspaceId),
        eq(files.version, input.expectedVersion),
      ),
    )
    .returning();

  if (!updated) {
    await throwVersionConflict(db, "file", input.id, input.workspaceId);
  }

  await recordWorkspaceSyncEvent(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDeviceId: input.actorDeviceId,
    entityType: "file",
    entityId: updated!.id,
    eventType: "renamed",
    payload: createFileSyncPayload(updated!),
  });

  return updated!;
}

export async function desktopMoveFile(
  db: Database,
  input: {
    workspaceId: string;
    id: string;
    targetFolderId: string | null;
    expectedVersion: number;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  if (input.targetFolderId) {
    const [folder] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, input.targetFolderId),
          eq(folders.workspaceId, input.workspaceId),
        ),
      );
    if (!folder) throw new Error("Target folder not found");
  }

  const [updated] = await db
    .update(files)
    .set({
      folderId: input.targetFolderId,
      version: sql`${files.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(files.id, input.id),
        eq(files.workspaceId, input.workspaceId),
        eq(files.version, input.expectedVersion),
      ),
    )
    .returning();

  if (!updated) {
    await throwVersionConflict(db, "file", input.id, input.workspaceId);
  }

  await recordWorkspaceSyncEvent(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDeviceId: input.actorDeviceId,
    entityType: "file",
    entityId: updated!.id,
    eventType: "moved",
    payload: createFileSyncPayload(updated!),
  });

  return updated!;
}

export async function desktopDeleteFile(
  db: Database,
  input: {
    workspaceId: string;
    id: string;
    expectedVersion: number;
    actorUserId: string;
    actorDeviceId: string;
  },
) {
  await requireWorkspaceMembership(db, {
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
  });

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, input.id),
        eq(files.workspaceId, input.workspaceId),
        eq(files.version, input.expectedVersion),
      ),
    );

  if (!file) {
    await throwVersionConflict(db, "file", input.id, input.workspaceId);
    return { success: false }; // unreachable, keeps TS happy
  }

  // Delete from storage
  const storage = await createStorageForFile(file.storageConfigId);
  await storage.delete(file.storagePath);

  // De-index from search
  void deindexFile(db, input.workspaceId, file.id);

  // Delete from database
  await db.delete(files).where(eq(files.id, input.id));

  await recordWorkspaceSyncEvent(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDeviceId: input.actorDeviceId,
    entityType: "file",
    entityId: file.id,
    eventType: "deleted",
    payload: { id: file.id },
  });

  // Update storage usage
  await db
    .update(workspaces)
    .set({
      storageUsed: sql`GREATEST(${workspaces.storageUsed} - ${file.size}, 0)`,
    })
    .where(eq(workspaces.id, input.workspaceId));

  return { success: true };
}

// ── Subtree delete ────────────────────────────────────────────────────────

export async function subtreeDeleteFolder(
  db: Database,
  workspaceId: string,
  folderId: string,
  actorUserId: string,
  actorDeviceId?: string,
) {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.workspaceId, workspaceId)));

  if (!folder) return;

  // Recursively delete subfolders first
  const subfolders = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(eq(folders.parentId, folderId), eq(folders.workspaceId, workspaceId)),
    );

  for (const subfolder of subfolders) {
    await subtreeDeleteFolder(
      db,
      workspaceId,
      subfolder.id,
      actorUserId,
      actorDeviceId,
    );
  }

  // Delete all files in this folder
  const folderFiles = await db
    .select()
    .from(files)
    .where(
      and(eq(files.folderId, folderId), eq(files.workspaceId, workspaceId)),
    );

  let totalDeletedSize = 0;

  for (const file of folderFiles) {
    const storage = await createStorageForFile(file.storageConfigId);
    try {
      await storage.delete(file.storagePath);
    } catch {}

    void deindexFile(db, workspaceId, file.id);

    await db.delete(files).where(eq(files.id, file.id));

    await recordWorkspaceSyncEvent(db, {
      workspaceId,
      actorUserId,
      actorDeviceId,
      entityType: "file",
      entityId: file.id,
      eventType: "deleted",
      payload: { id: file.id },
    });

    totalDeletedSize += file.size;
  }

  // Delete the folder itself
  await db
    .delete(folders)
    .where(and(eq(folders.id, folderId), eq(folders.workspaceId, workspaceId)));

  await recordWorkspaceSyncEvent(db, {
    workspaceId,
    actorUserId,
    actorDeviceId,
    entityType: "folder",
    entityId: folder.id,
    eventType: "deleted",
    payload: { id: folder.id },
  });

  // Update storage usage
  if (totalDeletedSize > 0) {
    await db
      .update(workspaces)
      .set({
        storageUsed: sql`GREATEST(${workspaces.storageUsed} - ${totalDeletedSize}, 0)`,
      })
      .where(eq(workspaces.id, workspaceId));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function throwVersionConflict(
  db: Database,
  entityType: "file" | "folder",
  entityId: string,
  workspaceId: string,
): Promise<never> {
  const table = entityType === "file" ? files : folders;
  const [current] = await db
    .select({ version: table.version })
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.workspaceId, workspaceId)));

  if (!current) {
    throw new Error(
      `${entityType === "file" ? "File" : "Folder"} not found`,
    );
  }

  throw new DesktopVersionConflictError(entityId, current.version);
}

async function indexFileForSearch(
  db: Database,
  workspaceId: string,
  file: typeof files.$inferSelect,
  storage: { download: (path: string) => Promise<{ data: ReadableStream }> },
) {
  try {
    if (qmdClient.shouldIndex(file.mimeType)) {
      const endpoint = await resolvePluginEndpoint(db, workspaceId, "qmd-search", {
        serviceUrl: process.env.QMD_SERVICE_URL,
        apiSecret: process.env.QMD_API_SECRET,
      });
      if (endpoint) {
        const { data } = await storage.download(file.storagePath);
        const content = await streamToString(data);
        await qmdClient.indexFile(
          { workspaceId, fileId: file.id, fileName: file.name, mimeType: file.mimeType, content },
          endpoint,
        );
      }
    }

    if (ftsClient.shouldIndex(file.mimeType)) {
      const endpoint = await resolvePluginEndpoint(db, workspaceId, "fts-search", {
        serviceUrl: process.env.FTS_SERVICE_URL,
        apiSecret: process.env.FTS_API_SECRET,
      });
      if (endpoint) {
        const { data } = await storage.download(file.storagePath);
        const content = await streamToString(data);
        await ftsClient.indexFile(
          { workspaceId, fileId: file.id, fileName: file.name, mimeType: file.mimeType, content },
          endpoint,
        );
      }
    }
  } catch (err) {
    logFireAndForget("search-index", { fileId: file.id, workspaceId })(err);
  }
}

async function deindexFile(db: Database, workspaceId: string, fileId: string) {
  try {
    const qmdEndpoint = await resolvePluginEndpoint(db, workspaceId, "qmd-search", {
      serviceUrl: process.env.QMD_SERVICE_URL,
      apiSecret: process.env.QMD_API_SECRET,
    });
    if (qmdEndpoint) {
      await qmdClient.deindexFile({ workspaceId, fileId }, qmdEndpoint);
    }

    const ftsEndpoint = await resolvePluginEndpoint(db, workspaceId, "fts-search", {
      serviceUrl: process.env.FTS_SERVICE_URL,
      apiSecret: process.env.FTS_API_SECRET,
    });
    if (ftsEndpoint) {
      await ftsClient.deindexFile({ workspaceId, fileId }, ftsEndpoint);
    }
  } catch (err) {
    logFireAndForget("search-deindex", { fileId, workspaceId })(err);
  }
}
