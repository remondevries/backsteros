CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"project_id" text,
	"path" text NOT NULL,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text DEFAULT 'text/markdown' NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"checksum" text,
	"snippet" text,
	"content_version" integer DEFAULT 1 NOT NULL,
	"content_etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "documents_type_idx" ON "documents" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "documents_project_id_idx" ON "documents" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "documents_path_idx" ON "documents" USING btree ("path");
--> statement-breakpoint
CREATE INDEX "documents_deleted_at_idx" ON "documents" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "documents_type_project_path_idx" ON "documents" USING btree ("type","project_id","path");
