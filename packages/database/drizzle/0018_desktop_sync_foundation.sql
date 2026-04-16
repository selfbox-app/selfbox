ALTER TABLE "files" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint

CREATE TABLE "desktop_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"client_name" varchar(120),
	"client_version" varchar(40),
	"platform" varchar(32) NOT NULL,
	"user_code" varchar(16) NOT NULL,
	"device_code_hash" varchar(64) NOT NULL,
	"access_token_hash" varchar(64),
	"refresh_token_hash" varchar(64),
	"approval_expires_at" timestamp NOT NULL,
	"approved_at" timestamp,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"last_seen_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_devices_user_code_idx" UNIQUE("user_code"),
	CONSTRAINT "desktop_devices_device_code_hash_idx" UNIQUE("device_code_hash"),
	CONSTRAINT "desktop_devices_access_token_hash_idx" UNIQUE("access_token_hash"),
	CONSTRAINT "desktop_devices_refresh_token_hash_idx" UNIQUE("refresh_token_hash")
);--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desktop_devices_user_id_idx" ON "desktop_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "desktop_devices_approval_expires_at_idx" ON "desktop_devices" USING btree ("approval_expires_at");--> statement-breakpoint

CREATE TABLE "workspace_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cursor" bigint NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"payload" jsonb NOT NULL,
	"actor_user_id" text,
	"actor_device_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "workspace_sync_events" ADD CONSTRAINT "workspace_sync_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sync_events" ADD CONSTRAINT "workspace_sync_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sync_events" ADD CONSTRAINT "workspace_sync_events_actor_device_id_desktop_devices_id_fk" FOREIGN KEY ("actor_device_id") REFERENCES "public"."desktop_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_sync_events_workspace_cursor_idx" ON "workspace_sync_events" USING btree ("workspace_id","cursor");--> statement-breakpoint
CREATE INDEX "workspace_sync_events_workspace_created_at_idx" ON "workspace_sync_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_sync_events_workspace_entity_idx" ON "workspace_sync_events" USING btree ("workspace_id","entity_type","entity_id");
