-- Server-only document FTS (OS-80). Not in the PowerSync publication.
-- Covers title/path/snippet/properties + body text (search_body) via tsvector/GIN.

CREATE OR REPLACE FUNCTION documents_build_search_tsv(
  p_title text,
  p_path text,
  p_snippet text,
  p_properties jsonb,
  p_body text
) RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    setweight(to_tsvector('simple', coalesce(p_title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(p_path, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(p_snippet, '')), 'C')
    || setweight(to_tsvector('simple', coalesce(p_properties::text, '')), 'C')
    || setweight(to_tsvector('simple', left(coalesce(p_body, ''), 500000)), 'D');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION documents_plainquery(p_q text)
RETURNS tsquery
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result tsquery;
  term text;
  piece tsquery;
  first boolean := true;
BEGIN
  IF p_q IS NULL OR length(trim(p_q)) = 0 THEN
    RETURN NULL;
  END IF;
  FOREACH term IN ARRAY regexp_split_to_array(lower(trim(p_q)), '[^[:alnum:]]+')
  LOOP
    IF term IS NULL OR term = '' THEN
      CONTINUE;
    END IF;
    BEGIN
      piece := to_tsquery('simple', term || ':*');
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF first THEN
      result := piece;
      first := false;
    ELSE
      result := result && piece;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_search_index" (
  "document_id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "search_body" text,
  "search_tsv" tsvector NOT NULL,
  "content_etag" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "document_search_index" ADD CONSTRAINT "document_search_index_document_id_documents_id_fk"
   FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION document_search_index_refresh_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  d_title text;
  d_path text;
  d_snippet text;
  d_properties jsonb;
BEGIN
  SELECT title, path, snippet, properties
    INTO d_title, d_path, d_snippet, d_properties
  FROM documents
  WHERE id = NEW.document_id;

  NEW.search_tsv := documents_build_search_tsv(
    coalesce(d_title, ''),
    coalesce(d_path, ''),
    d_snippet,
    coalesce(d_properties, '{}'::jsonb),
    NEW.search_body
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS document_search_index_tsv ON document_search_index;
CREATE TRIGGER document_search_index_tsv
BEFORE INSERT OR UPDATE ON document_search_index
FOR EACH ROW
EXECUTE PROCEDURE document_search_index_refresh_tsv();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION documents_ensure_search_index()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM document_search_index WHERE document_id = NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO document_search_index (document_id, workspace_id)
  VALUES (NEW.id, NEW.workspace_id)
  ON CONFLICT (document_id) DO UPDATE
    SET workspace_id = EXCLUDED.workspace_id,
        updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS documents_ensure_search_index ON documents;
CREATE TRIGGER documents_ensure_search_index
AFTER INSERT OR UPDATE OF title, path, snippet, properties, deleted_at, workspace_id
ON documents
FOR EACH ROW
EXECUTE PROCEDURE documents_ensure_search_index();
--> statement-breakpoint

INSERT INTO document_search_index (document_id, workspace_id, search_body, content_etag)
SELECT id, workspace_id, NULL, content_etag
FROM documents
WHERE deleted_at IS NULL
ON CONFLICT (document_id) DO NOTHING;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_search_index_workspace_id_idx"
  ON "document_search_index" USING btree ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_search_index_tsv_gin"
  ON "document_search_index" USING gin ("search_tsv");
