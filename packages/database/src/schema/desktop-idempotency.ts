import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { desktopDevices } from "./desktop-devices";

/**
 * Cached responses for desktop mutation requests keyed by a client-supplied
 * idempotency key. When a request arrives with a key that already has a
 * cached response, the mutation is short-circuited and the cached response
 * is returned — so if the client retries after a transient failure, the
 * server doesn't double-apply the change.
 *
 * Rows are scoped per device so one device's keys can't collide with
 * another's. Purged after 24h via a periodic cleanup.
 */
export const desktopIdempotencyKeys = pgTable(
  "desktop_idempotency_keys",
  {
    key: text("key").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => desktopDevices.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("desktop_idempotency_keys_device_id_idx").on(table.deviceId),
    index("desktop_idempotency_keys_created_at_idx").on(table.createdAt),
  ],
);
