CREATE TABLE "workspace_storage_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"region" varchar(50),
	"endpoint" text,
	"encrypted_credentials" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_storage_configs" ADD CONSTRAINT "workspace_storage_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_storage_configs_workspace_id_idx" ON "workspace_storage_configs" USING btree ("workspace_id");