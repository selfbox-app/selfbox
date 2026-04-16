import { and, asc, eq, gt, min } from "drizzle-orm";
import {
  files,
  folders,
  workspaceMembers,
  workspaces,
  workspaceSyncEvents,
} from "@selfbox/database";
import type { Database } from "@selfbox/database";
import type { DesktopWorkspaceSummary, WorkspaceRole } from "@selfbox/common";
import { createFileSyncPayload, createFolderSyncPayload, getLatestWorkspaceCursor } from "./sync-events";

export async function listDesktopWorkspaces(
  db: Database,
  userId: string,
): Promise<DesktopWorkspaceSummary[]> {
  const memberships = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.name));

  return memberships.map((membership) => ({
    ...membership,
    role: membership.role as WorkspaceRole,
  }));
}

export async function bootstrapDesktopWorkspace(
  db: Database,
  input: { userId: string; workspaceId: string },
) {
  const workspace = await requireWorkspaceMembership(db, input);

  const [folderRows, fileRows, cursor] = await Promise.all([
    db
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, input.workspaceId))
      .orderBy(asc(folders.createdAt), asc(folders.name)),
    db
      .select()
      .from(files)
      .where(eq(files.workspaceId, input.workspaceId))
      .orderBy(asc(files.createdAt), asc(files.name)),
    getLatestWorkspaceCursor(db, input.workspaceId),
  ]);

  return {
    workspace,
    cursor,
    folders: folderRows.map(createFolderSyncPayload),
    files: fileRows.map(createFileSyncPayload),
  };
}

export async function listDesktopWorkspaceChanges(
  db: Database,
  input: { userId: string; workspaceId: string; cursor: number; limit: number },
) {
  await requireWorkspaceMembership(db, input);

  // Detect stale cursor: if the client's cursor is behind the oldest available
  // event, it has missed events and must re-bootstrap.
  if (input.cursor > 0) {
    const [oldest] = await db
      .select({ minCursor: min(workspaceSyncEvents.cursor) })
      .from(workspaceSyncEvents)
      .where(eq(workspaceSyncEvents.workspaceId, input.workspaceId));

    const minCursor = oldest?.minCursor ?? 0;
    if (minCursor > 0 && input.cursor < minCursor) {
      return {
        cursor: input.cursor,
        hasMore: false,
        cursorInvalid: true,
        events: [],
      };
    }
  }

  const [events, latestCursor] = await Promise.all([
    db
      .select()
      .from(workspaceSyncEvents)
      .where(
        and(
          eq(workspaceSyncEvents.workspaceId, input.workspaceId),
          gt(workspaceSyncEvents.cursor, input.cursor),
        ),
      )
      .orderBy(asc(workspaceSyncEvents.cursor))
      .limit(input.limit),
    getLatestWorkspaceCursor(db, input.workspaceId),
  ]);

  const lastReturnedCursor = events.at(-1)?.cursor ?? input.cursor;

  return {
    cursor: lastReturnedCursor,
    hasMore: lastReturnedCursor < latestCursor,
    cursorInvalid: false,
    events: events.map((event) => ({
      cursor: event.cursor,
      entityType: event.entityType,
      entityId: event.entityId,
      eventType: event.eventType,
      payload: event.payload,
      // Desktop clients filter out events they themselves caused (echo
      // suppression — without this, an upload from device X polls back to X
      // as a "download" event the engine then tries to re-apply).
      actorDeviceId: event.actorDeviceId,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function requireWorkspaceMembership(
  db: Database,
  input: { userId: string; workspaceId: string },
) {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.workspaceId),
        eq(workspaceMembers.userId, input.userId),
      ),
    )
    .limit(1);

  if (!workspace) {
    throw new Error("Workspace not found or access denied");
  }

  return {
    ...workspace,
    role: workspace.role as WorkspaceRole,
  };
}
