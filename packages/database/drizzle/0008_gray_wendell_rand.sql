DROP INDEX "workspace_storage_configs_workspace_id_idx";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "storage_config_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_storage_config_id_workspace_storage_configs_id_fk" FOREIGN KEY ("storage_config_id") REFERENCES "public"."workspace_storage_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_storage_configs_workspace_id_idx" ON "workspace_storage_configs" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_storage_configs_active_workspace_idx" ON "workspace_storage_configs" ("workspace_id") WHERE "is_active" = true;