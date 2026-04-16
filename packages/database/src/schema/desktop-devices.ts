import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const desktopDevices = pgTable(
  "desktop_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    clientName: varchar("client_name", { length: 120 }),
    clientVersion: varchar("client_version", { length: 40 }),
    platform: varchar("platform", { length: 32 }).notNull(),
    userCode: varchar("user_code", { length: 16 }).notNull(),
    deviceCodeHash: varchar("device_code_hash", { length: 64 }).notNull(),
    accessTokenHash: varchar("access_token_hash", { length: 64 }),
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }),
    approvalExpiresAt: timestamp("approval_expires_at").notNull(),
    approvedAt: timestamp("approved_at"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    lastSeenAt: timestamp("last_seen_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("desktop_devices_user_code_idx").on(table.userCode),
    uniqueIndex("desktop_devices_device_code_hash_idx").on(table.deviceCodeHash),
    uniqueIndex("desktop_devices_access_token_hash_idx").on(
      table.accessTokenHash,
    ),
    uniqueIndex("desktop_devices_refresh_token_hash_idx").on(
      table.refreshTokenHash,
    ),
    index("desktop_devices_user_id_idx").on(table.userId),
    index("desktop_devices_approval_expires_at_idx").on(table.approvalExpiresAt),
  ],
);

export const desktopDevicesRelations = relations(
  desktopDevices,
  ({ one }) => ({
    user: one(users, {
      fields: [desktopDevices.userId],
      references: [users.id],
    }),
  }),
);
