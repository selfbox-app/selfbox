import { and, desc, eq, sql } from "drizzle-orm";
import { files, folders, workspaceSyncEvents } from "@selfbox/database";
import type { Database } from "@selfbox/database";
import type { SyncEntityType, SyncEventType } from "@selfbox/common";

export interface FileSyncPayload {
  id: string;
  folderId: string | null;
  name: string;
  mimeType: string;
  size: number;
  checksum: string | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderSyncPayload {
  id: string;
  parentId: string | null;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceSyncPayload =
  | { id: string }
  | FileSyncPayload
  | FolderSyncPayload;

export function createFileSyncPayload(
  file: typeof files.$inferSelect,
): FileSyncPayload {
  return {
    id: file.id,
    folderId: file.folderId,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    checksum: file.checksum ?? null,
    status: file.status,
    version: file.version,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

export function createFolderSyncPayload(
  folder: typeof folders.$inferSelect,
): FolderSyncPayload {
  return {
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    version: folder.version,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export async function recordWorkspaceSyncEvent(
  db: Database,
  input: {
    workspaceId: string;
    actorUserId?: string | null;
    actorDeviceId?: string | null;
    entityType: SyncEntityType;
    entityId: string;
    eventType: SyncEventType;
    payload: WorkspaceSyncPayload;
  },
) {
  await db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ cursor: workspaceSyncEvents.cursor })
      .from(workspaceSyncEvents)
      .where(eq(workspaceSyncEvents.workspaceId, input.workspaceId))
      .orderBy(desc(workspaceSyncEvents.cursor))
      .limit(1);

    await tx.insert(workspaceSyncEvents).values({
      workspaceId: input.workspaceId,
      cursor: (latest?.cursor ?? 0) + 1,
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      payload: input.payload,
      actorUserId: input.actorUserId ?? null,
      actorDeviceId: input.actorDeviceId ?? null,
    });
  });
}

export async function getLatestWorkspaceCursor(
  db: Database,
  workspaceId: string,
): Promise<number> {
  const [latest] = await db
    .select({ cursor: workspaceSyncEvents.cursor })
    .from(workspaceSyncEvents)
    .where(eq(workspaceSyncEvents.workspaceId, workspaceId))
    .orderBy(desc(workspaceSyncEvents.cursor))
    .limit(1);

  return latest?.cursor ?? 0;
}
