/**
 * OS-204: insert-on-write + coalesce against an isolated test DB.
 * Opt-in only — set DOCUMENT_VERSIONS_DB_TEST=1 and point DATABASE_URL at
 * `backsteros_test` (never the live `backsteros` DB).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import postgres from "postgres";

function databaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

const dbUrl = process.env.DATABASE_URL ?? "";
const dbName = databaseName(dbUrl);
const skip =
  process.env.DOCUMENT_VERSIONS_DB_TEST !== "1" ||
  !dbUrl ||
  dbName === "backsteros" ||
  dbName === "";

describe("document_versions DB upsert/coalesce (OS-204)", { skip }, () => {
  let sql: ReturnType<typeof postgres>;
  let upsertDocumentVersion: typeof import("./document-versions.js").upsertDocumentVersion;
  let getDocumentVersionWithPrevious: typeof import("./document-versions.js").getDocumentVersionWithPrevious;

  const workspaceId = "ws_os204_test";
  const documentId = "doc_os204_test";

  before(async () => {
    sql = postgres(dbUrl!, { max: 1, prepare: false });
    const tables = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'document_versions'
    `;
    if (tables.length === 0) {
      throw new Error(
        "document_versions missing — migrate backsteros_test first (0213_document_versions)",
      );
    }

    // Minimal parents so FKs succeed (ignore if already present).
    await sql`
      INSERT INTO workspaces (id, name, slug, created_at, updated_at)
      VALUES (${workspaceId}, 'OS-204 test', 'os204-test', now(), now())
      ON CONFLICT (id) DO NOTHING
    `.catch(async () => {
      // Schema may use different workspace columns; try a softer probe.
      const rows = await sql`SELECT id FROM workspaces WHERE id = ${workspaceId}`;
      if (rows.length === 0) {
        throw new Error("Could not ensure workspace for OS-204 DB test");
      }
    });

    const docs = await sql`SELECT id FROM documents WHERE id = ${documentId}`;
    if (docs.length === 0) {
      await sql`
        INSERT INTO documents (
          id, workspace_id, type, path, title, storage_key,
          content_type, byte_size, content_version, created_at, updated_at
        ) VALUES (
          ${documentId}, ${workspaceId}, 'project', 'os204.md', 'OS-204',
          'vault/os204.md', 'text/markdown', 0, 1, now(), now()
        )
      `;
    }

    ({ upsertDocumentVersion, getDocumentVersionWithPrevious } = await import(
      "./document-versions.js"
    ));
  });

  after(async () => {
    if (!sql) return;
    await sql`DELETE FROM document_versions WHERE document_id = ${documentId}`;
    await sql.end({ timeout: 2 }).catch(() => undefined);
  });

  it("inserts a full-text row and coalesces retries for the same content_version", async () => {
    await sql`DELETE FROM document_versions WHERE document_id = ${documentId}`;

    const first = await upsertDocumentVersion({
      workspaceId,
      documentId,
      contentVersion: 5,
      content: "alpha\n",
      actor: { kind: "user", name: "Remon" },
    });
    assert.equal(first.contentVersion, 5);
    assert.equal(first.content, "alpha\n");

    const second = await upsertDocumentVersion({
      workspaceId,
      documentId,
      contentVersion: 5,
      content: "alpha\nbeta\n",
      actor: { kind: "user", name: "Remon" },
    });
    assert.equal(second.contentVersion, 5);
    assert.equal(second.content, "alpha\nbeta\n");
    assert.equal(second.id, first.id);

    const count = await sql`
      SELECT count(*)::int AS n FROM document_versions
      WHERE document_id = ${documentId} AND content_version = 5 AND deleted_at IS NULL
    `;
    assert.equal(count[0]?.n, 1);
  });

  it("getDocumentVersionWithPrevious returns null previous when none stored", async () => {
    await sql`DELETE FROM document_versions WHERE document_id = ${documentId}`;
    await upsertDocumentVersion({
      workspaceId,
      documentId,
      contentVersion: 1,
      content: "only",
    });
    const result = await getDocumentVersionWithPrevious(
      workspaceId,
      documentId,
      1,
    );
    assert.ok(result.version);
    assert.equal(result.previous, null);
  });

  it("getDocumentVersionWithPrevious returns the nearest lower version", async () => {
    await sql`DELETE FROM document_versions WHERE document_id = ${documentId}`;
    await upsertDocumentVersion({
      workspaceId,
      documentId,
      contentVersion: 2,
      content: "v2",
    });
    await upsertDocumentVersion({
      workspaceId,
      documentId,
      contentVersion: 4,
      content: "v4",
    });
    const result = await getDocumentVersionWithPrevious(
      workspaceId,
      documentId,
      4,
    );
    assert.equal(result.version?.content, "v4");
    assert.equal(result.previous?.contentVersion, 2);
    assert.equal(result.previous?.content, "v2");
  });
});
