CREATE TABLE "file_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(7),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_tags_file_tag_idx" ON "file_tags" USING btree ("file_id","tag_id");--> statement-breakpoint
CREATE INDEX "file_tags_file_id_idx" ON "file_tags" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_tags_tag_id_idx" ON "file_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tags_workspace_id_idx" ON "tags" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_idx" ON "tags" USING btree ("workspace_id","name");