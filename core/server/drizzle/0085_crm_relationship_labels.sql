CREATE TABLE IF NOT EXISTS "crm_relationship_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"side_a_label" text NOT NULL,
	"side_a_slug" text NOT NULL,
	"side_b_label" text NOT NULL,
	"side_b_slug" text NOT NULL,
	"color" text,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_relationship_labels" ADD CONSTRAINT "crm_relationship_labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_relationship_labels_workspace_id_idx" ON "crm_relationship_labels" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_relationship_labels_deleted_at_idx" ON "crm_relationship_labels" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_relationship_labels_side_a_slug_idx" ON "crm_relationship_labels" USING btree ("workspace_id","side_a_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_relationship_labels_side_b_slug_idx" ON "crm_relationship_labels" USING btree ("workspace_id","side_b_slug");
--> statement-breakpoint
-- Seed default bidirectional labels for every existing workspace.
INSERT INTO "crm_relationship_labels" (
  "id",
  "workspace_id",
  "side_a_label",
  "side_a_slug",
  "side_b_label",
  "side_b_slug",
  "color",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  md5(w.id || ':' || d.side_a_slug || ':' || d.side_b_slug || ':' || d.sort_order::text),
  w.id,
  d.side_a_label,
  d.side_a_slug,
  d.side_b_label,
  d.side_b_slug,
  NULL,
  d.sort_order,
  now(),
  now()
FROM "workspaces" w
CROSS JOIN (
  VALUES
    ('Parent', 'parent', 'Child', 'child', 10),
    ('Spouse', 'spouse', 'Spouse', 'spouse', 20),
    ('Partner', 'partner', 'Partner', 'partner', 30),
    ('Sibling', 'sibling', 'Sibling', 'sibling', 40),
    ('Friend', 'friend', 'Friend', 'friend', 50),
    ('Colleague', 'colleague', 'Colleague', 'colleague', 60),
    ('Reports to', 'reports_to', 'Manager of', 'manager_of', 70)
) AS d(side_a_label, side_a_slug, side_b_label, side_b_slug, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM "crm_relationship_labels" existing
  WHERE existing.workspace_id = w.id
    AND existing.deleted_at IS NULL
    AND (
      existing.side_a_slug = d.side_a_slug
      OR existing.side_b_slug = d.side_a_slug
      OR existing.side_a_slug = d.side_b_slug
      OR existing.side_b_slug = d.side_b_slug
    )
);
