CREATE TABLE "desktop_idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desktop_idempotency_keys" ADD CONSTRAINT "desktop_idempotency_keys_device_id_desktop_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."desktop_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desktop_idempotency_keys_device_id_idx" ON "desktop_idempotency_keys" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "desktop_idempotency_keys_created_at_idx" ON "desktop_idempotency_keys" USING btree ("created_at");
