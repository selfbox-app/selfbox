CREATE TABLE "kb_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_by_id" text,
	"name" varchar(200) NOT NULL,
	"description" text,
	"schema_prompt" text DEFAULT '' NOT NULL,
	"model" varchar(80),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_ingested_at" timestamp,
	"last_linted_at" timestamp,
	"wiki_storage_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kb_conversations" ADD CONSTRAINT "kb_conversations_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_conversations" ADD CONSTRAINT "kb_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_messages" ADD CONSTRAINT "kb_messages_conversation_id_kb_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."kb_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_conversations_kb_idx" ON "kb_conversations" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "kb_conversations_user_idx" ON "kb_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kb_messages_conversation_idx" ON "kb_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "kb_messages_created_idx" ON "kb_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_bases_workspace_idx" ON "knowledge_bases" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bases_workspace_tag_idx" ON "knowledge_bases" USING btree ("workspace_id","tag_id");
