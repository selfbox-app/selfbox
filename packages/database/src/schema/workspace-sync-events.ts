import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { workspaces } from "./workspaces";
import { desktopDevices } from "./desktop-devices";

export const workspaceSyncEvents = pgTable(
  "workspace_sync_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    cursor: bigint("cursor", { mode: "number" }).notNull(),
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    eventType: varchar("event_type", { length: 20 }).notNull(),
    payload: jsonb("payload").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorDeviceId: uuid("actor_device_id").references(() => desktopDevices.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_sync_events_workspace_cursor_idx").on(
      table.workspaceId,
      table.cursor,
    ),
    index("workspace_sync_events_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("workspace_sync_events_workspace_entity_idx").on(
      table.workspaceId,
      table.entityType,
      table.entityId,
    ),
  ],
);

export const workspaceSyncEventsRelations = relations(
  workspaceSyncEvents,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceSyncEvents.workspaceId],
      references: [workspaces.id],
    }),
    actorUser: one(users, {
      fields: [workspaceSyncEvents.actorUserId],
      references: [users.id],
    }),
    actorDevice: one(desktopDevices, {
      fields: [workspaceSyncEvents.actorDeviceId],
      references: [desktopDevices.id],
    }),
  }),
);
