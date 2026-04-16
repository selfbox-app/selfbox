import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { files } from './files';
import { folders } from './folders';
import { workspaces } from './workspaces';

export const trackedLinkEventTypeEnum = pgEnum('tracked_link_event_type', [
  'view',
  'download',
]);

export const trackedLinks = pgTable(
  'tracked_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id').references(() => folders.id, {
      onDelete: 'cascade',
    }),
    token: varchar('token', { length: 255 }).unique().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    access: varchar('access', { length: 20 }).notNull().default('view'),
    hasPassword: boolean('has_password').default(false),
    passwordHash: text('password_hash'),
    requireEmail: boolean('require_email').default(false),
    expiresAt: timestamp('expires_at'),
    validFrom: timestamp('valid_from'),
    validUntil: timestamp('valid_until'),
    maxViews: integer('max_views'),
    viewCount: integer('view_count').default(0).notNull(),
    downloadCount: integer('download_count').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('tracked_links_token_idx').on(table.token),
    index('tracked_links_workspace_id_idx').on(table.workspaceId),
    index('tracked_links_user_id_idx').on(table.userId),
    index('tracked_links_file_id_idx').on(table.fileId),
    index('tracked_links_folder_id_idx').on(table.folderId),
  ],
);

export const trackedLinksRelations = relations(trackedLinks, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [trackedLinks.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [trackedLinks.userId],
    references: [users.id],
  }),
  file: one(files, {
    fields: [trackedLinks.fileId],
    references: [files.id],
  }),
  folder: one(folders, {
    fields: [trackedLinks.folderId],
    references: [folders.id],
  }),
  events: many(trackedLinkEvents),
}));

export const trackedLinkEvents = pgTable(
  'tracked_link_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackedLinkId: uuid('tracked_link_id')
      .notNull()
      .references(() => trackedLinks.id, { onDelete: 'cascade' }),
    eventType: trackedLinkEventTypeEnum('event_type').notNull().default('view'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),

    // Visitor identification
    visitorId: varchar('visitor_id', { length: 64 }),
    email: varchar('email', { length: 255 }),

    // Network
    ipAddress: varchar('ip_address', { length: 45 }),

    // Geolocation (resolved server-side from IP)
    country: varchar('country', { length: 100 }),
    countryCode: varchar('country_code', { length: 2 }),
    region: varchar('region', { length: 100 }),
    city: varchar('city', { length: 100 }),
    latitude: real('latitude'),
    longitude: real('longitude'),

    // User agent details
    userAgent: text('user_agent'),
    browser: varchar('browser', { length: 100 }),
    browserVersion: varchar('browser_version', { length: 50 }),
    os: varchar('os', { length: 100 }),
    osVersion: varchar('os_version', { length: 50 }),
    deviceType: varchar('device_type', { length: 20 }),

    // Request context
    referrer: text('referrer'),
    utmSource: varchar('utm_source', { length: 255 }),
    utmMedium: varchar('utm_medium', { length: 255 }),
    utmCampaign: varchar('utm_campaign', { length: 255 }),
    language: varchar('language', { length: 50 }),

    // Engagement (updated via beacon)
    durationSeconds: integer('duration_seconds'),
  },
  (table) => [
    index('tracked_link_events_link_id_idx').on(table.trackedLinkId),
    index('tracked_link_events_timestamp_idx').on(table.timestamp),
    index('tracked_link_events_visitor_id_idx').on(table.visitorId),
  ],
);

export const trackedLinkEventsRelations = relations(trackedLinkEvents, ({ one }) => ({
  trackedLink: one(trackedLinks, {
    fields: [trackedLinkEvents.trackedLinkId],
    references: [trackedLinks.id],
  }),
}));
