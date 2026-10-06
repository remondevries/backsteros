-- OS-80 follow-up: keep indexed body on soft-delete/restore, cap tsv input,
-- and never let to_tsvector overflow abort a document save.

-- Body lexemes are taken from the first 80000 characters only. Text past that
-- is stored on search_body for retrieve but is not in search_tsv.
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
    || setweight(to_tsvector('simple', left(coalesce(p_body, ''), 80000)), 'D');
$$;
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

  BEGIN
    NEW.search_tsv := documents_build_search_tsv(
      coalesce(d_title, ''),
      coalesce(d_path, ''),
      d_snippet,
      coalesce(d_properties, '{}'::jsonb),
      NEW.search_body
    );
  EXCEPTION WHEN program_limit_exceeded OR data_exception OR OTHERS THEN
    NEW.search_tsv := documents_build_search_tsv(
      coalesce(d_title, ''),
      coalesce(d_path, ''),
      d_snippet,
      coalesce(d_properties, '{}'::jsonb),
      NULL
    );
  END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION documents_ensure_search_index()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Keep search_body on soft-delete so restore does not lose the corpus.
  INSERT INTO document_search_index (document_id, workspace_id)
  VALUES (NEW.id, NEW.workspace_id)
  ON CONFLICT (document_id) DO UPDATE
    SET workspace_id = EXCLUDED.workspace_id,
        updated_at = now();
  RETURN NEW;
END;
$$;
