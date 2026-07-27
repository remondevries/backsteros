CREATE TABLE "sync_events" (
	"cursor" serial PRIMARY KEY NOT NULL,
	"mutation_id" text NOT NULL,
	"device_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_events_mutation_id_unique" UNIQUE("mutation_id")
);
--> statement-breakpoint
CREATE INDEX "sync_events_device_id_idx" ON "sync_events" USING btree ("device_id");
--> statement-breakpoint
CREATE INDEX "sync_events_created_at_idx" ON "sync_events" USING btree ("created_at");
