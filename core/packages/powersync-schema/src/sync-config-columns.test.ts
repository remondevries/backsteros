import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { appSchema } from "./index.js";

const syncConfigPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../deploy/powersync/sync-config.yaml",
);

/** Client column name from a SELECT item (`col` or `expr AS alias`). */
function clientColumnName(selectItem: string): string {
  const trimmed = selectItem.trim();
  const asMatch = trimmed.match(/\s+AS\s+(\w+)$/i);
  if (asMatch?.[1]) return asMatch[1];
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1]!;
}

function parseSyncSelectColumns(yaml: string): Map<string, Set<string>> {
  const byTable = new Map<string, Set<string>>();
  for (const match of yaml.matchAll(
    /SELECT\s+(.+?)\s+FROM\s+(\w+)/gis,
  )) {
    const table = match[2]!;
    const cols = match[1]!
      .split(",")
      .map(clientColumnName)
      .filter(Boolean);
    byTable.set(table, new Set(cols));
  }
  return byTable;
}

function schemaColumnsForTable(tableName: string): Set<string> {
  const table = appSchema.tables.find((t) => t.name === tableName);
  assert.ok(table, `powersync-schema missing table ${tableName}`);
  // PowerSync always materializes `id` on the client; Table column defs omit it.
  return new Set(["id", ...table.columns.map((c) => c.name)]);
}

/**
 * Client-schema columns kept for REST/detail + local drafts, not bulk-synced
 * (OS-163 / audit #12). Sync SELECT may omit these; schema may still declare them.
 */
const DETAIL_ONLY_SCHEMA_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  // Unused in contact/org UI (they edit `summary`); kept off the sync stream.
  organizations: ["notes"],
  contacts: ["notes"],
  // Meeting notes/transcription: desktop REST detail (`useDesktopMeetingNotes`).
  meetings: ["notes", "transcription"],
};

describe("PowerSync sync-config ↔ powersync-schema columns", () => {
  it("keeps every synced table SELECT in lockstep with the client schema", () => {
    const yaml = readFileSync(syncConfigPath, "utf8");
    const syncByTable = parseSyncSelectColumns(yaml);

    assert.equal(
      yaml.includes("deleted_at IS NULL"),
      false,
      "sync rules must include soft-deleted rows so clients receive tombstones",
    );
    assert.equal(
      [...syncByTable.values()].some((cols) => cols.has("portal_password_hash")),
      false,
      "portal_password_hash must never appear in sync SELECT",
    );

    const schemaTables = appSchema.tables.map((t) => t.name).sort();
    const syncTables = [...syncByTable.keys()].sort();
    assert.deepEqual(
      syncTables,
      schemaTables,
      "sync-config tables must match powersync-schema tables",
    );

    for (const tableName of schemaTables) {
      const expected = schemaColumnsForTable(tableName);
      const actual = syncByTable.get(tableName)!;
      const detailOnly = new Set(DETAIL_ONLY_SCHEMA_COLUMNS[tableName] ?? []);
      const missing = [...expected]
        .filter((c) => !actual.has(c) && !detailOnly.has(c))
        .sort();
      const extra = [...actual].filter((c) => !expected.has(c)).sort();
      assert.deepEqual(
        { missing, extra },
        { missing: [], extra: [] },
        `${tableName}: SELECT columns must match powersync-schema (missing=${missing.join(",") || "∅"} extra=${extra.join(",") || "∅"})`,
      );
      for (const col of detailOnly) {
        assert.equal(
          actual.has(col),
          false,
          `${tableName}.${col} is detail-only and must not be in sync SELECT`,
        );
        assert.ok(
          expected.has(col),
          `${tableName}.${col} detail-only allowlist requires schema column`,
        );
      }
    }
  });

  it("includes agent_working_* on the tasks stream (OS-108)", () => {
    const yaml = readFileSync(syncConfigPath, "utf8");
    const tasks = parseSyncSelectColumns(yaml).get("tasks");
    assert.ok(tasks);
    for (const col of [
      "agent_working_contact_id",
      "agent_working_started_at",
      "agent_working_label",
      "agent_working_kind",
      "execution_location",
      "execution_location_locked_at",
      "linked_email_ids",
      "automate_completion",
      "auto_review_delivery_status",
    ]) {
      assert.ok(tasks.has(col), `tasks SELECT must include ${col}`);
    }
  });

  it("includes development/production/channel on the projects stream", () => {
    const yaml = readFileSync(syncConfigPath, "utf8");
    const projects = parseSyncSelectColumns(yaml).get("projects");
    assert.ok(projects);
    for (const col of ["development", "production", "channel"]) {
      assert.ok(projects.has(col), `projects SELECT must include ${col}`);
    }
  });
});
