import {
  pgTable,
  uuid,
  varchar,
  text,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { folders } from "./folders";
import { workspaces } from "./workspaces";
import { workspaceStorageConfigs } from "./workspace-storage-configs";
import { fileTags } from "./tags";

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    storagePath: text("storage_path").notNull(),
    storageProvider: varchar("storage_provider", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ready"),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    thumbnailPath: text("thumbnail_path"),
    checksum: varchar("checksum", { length: 128 }),
    storageConfigId: uuid("storage_config_id").references(
      () => workspaceStorageConfigs.id,
      { onDelete: "set null" },
    ),
    s3Key: text("s3_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("files_workspace_id_idx").on(table.workspaceId),
    index("files_user_id_idx").on(table.userId),
    index("files_folder_id_idx").on(table.folderId),
    index("files_workspace_folder_idx").on(table.workspaceId, table.folderId),
    index("files_workspace_s3key_idx").on(table.workspaceId, table.s3Key),
  ],
);

export const filesRelations = relations(files, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [files.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [files.folderId],
    references: [folders.id],
  }),
  storageConfig: one(workspaceStorageConfigs, {
    fields: [files.storageConfigId],
    references: [workspaceStorageConfigs.id],
  }),
  fileTags: many(fileTags),
}));
