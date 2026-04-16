CREATE TYPE "public"."tracked_link_event_type" AS ENUM('view', 'download');--> statement-breakpoint
CREATE TABLE "tracked_link_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_link_id" uuid NOT NULL,
	"event_type" "tracked_link_event_type" DEFAULT 'view' NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"visitor_id" varchar(64),
	"email" varchar(255),
	"ip_address" varchar(45),
	"country" varchar(100),
	"country_code" varchar(2),
	"region" varchar(100),
	"city" varchar(100),
	"latitude" real,
	"longitude" real,
	"user_agent" text,
	"browser" varchar(100),
	"browser_version" varchar(50),
	"os" varchar(100),
	"os_version" varchar(50),
	"device_type" varchar(20),
	"referrer" text,
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(255),
	"language" varchar(50),
	"duration_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "tracked_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"file_id" uuid,
	"folder_id" uuid,
	"token" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"access" varchar(20) DEFAULT 'view' NOT NULL,
	"has_password" boolean DEFAULT false,
	"password_hash" text,
	"require_email" boolean DEFAULT false,
	"expires_at" timestamp,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"max_views" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_accessed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "tracked_link_events" ADD CONSTRAINT "tracked_link_events_tracked_link_id_tracked_links_id_fk" FOREIGN KEY ("tracked_link_id") REFERENCES "public"."tracked_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_link_events_link_id_idx" ON "tracked_link_events" USING btree ("tracked_link_id");--> statement-breakpoint
CREATE INDEX "tracked_link_events_timestamp_idx" ON "tracked_link_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "tracked_link_events_visitor_id_idx" ON "tracked_link_events" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "tracked_links_token_idx" ON "tracked_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tracked_links_workspace_id_idx" ON "tracked_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tracked_links_user_id_idx" ON "tracked_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tracked_links_file_id_idx" ON "tracked_links" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "tracked_links_folder_id_idx" ON "tracked_links" USING btree ("folder_id");