CREATE TABLE "plugin_invocation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_plugin_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action_id" varchar(120) NOT NULL,
	"target_type" varchar(20),
	"target_id" uuid,
	"status" varchar(20) NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_registry_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" text NOT NULL,
	"slug" varchar(80) NOT NULL,
	"manifest" jsonb NOT NULL,
	"source" varchar(20) DEFAULT 'inhouse' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_plugin_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_plugin_id" uuid NOT NULL,
	"key" varchar(80) NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"installed_by_id" text NOT NULL,
	"plugin_slug" varchar(80) NOT NULL,
	"source" varchar(20) NOT NULL,
	"manifest" jsonb NOT NULL,
	"granted_permissions" jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plugin_invocation_logs" ADD CONSTRAINT "plugin_invocation_logs_workspace_plugin_id_workspace_plugins_id_fk" FOREIGN KEY ("workspace_plugin_id") REFERENCES "public"."workspace_plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_invocation_logs" ADD CONSTRAINT "plugin_invocation_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_registry_entries" ADD CONSTRAINT "plugin_registry_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_registry_entries" ADD CONSTRAINT "plugin_registry_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_plugin_secrets" ADD CONSTRAINT "workspace_plugin_secrets_workspace_plugin_id_workspace_plugins_id_fk" FOREIGN KEY ("workspace_plugin_id") REFERENCES "public"."workspace_plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD CONSTRAINT "workspace_plugins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_plugins" ADD CONSTRAINT "workspace_plugins_installed_by_id_users_id_fk" FOREIGN KEY ("installed_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugin_invocation_logs_plugin_idx" ON "plugin_invocation_logs" USING btree ("workspace_plugin_id");--> statement-breakpoint
CREATE INDEX "plugin_invocation_logs_actor_idx" ON "plugin_invocation_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "plugin_invocation_logs_created_idx" ON "plugin_invocation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_registry_entries_workspace_slug_idx" ON "plugin_registry_entries" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "plugin_registry_entries_workspace_idx" ON "plugin_registry_entries" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_plugin_secrets_plugin_key_idx" ON "workspace_plugin_secrets" USING btree ("workspace_plugin_id","key");--> statement-breakpoint
CREATE INDEX "workspace_plugin_secrets_plugin_idx" ON "workspace_plugin_secrets" USING btree ("workspace_plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_plugins_workspace_slug_idx" ON "workspace_plugins" USING btree ("workspace_id","plugin_slug");--> statement-breakpoint
CREATE INDEX "workspace_plugins_workspace_idx" ON "workspace_plugins" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_plugins_status_idx" ON "workspace_plugins" USING btree ("status");