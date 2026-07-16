import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { buildMigrationRecords } from "./records.js";
import {
  CircleContentSource,
  EXCLUDED_TABLES,
  openSourceSnapshot,
} from "./source.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "circle-migration-"));
  const vault = path.join(root, "vault");
  const dbPath = path.join(root, "circle.db");
  fs.mkdirSync(path.join(vault, "projects", "PRJ", "folder"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(vault, "knowledge"), { recursive: true });
  fs.mkdirSync(path.join(vault, "journal"), { recursive: true });
  fs.writeFileSync(
    path.join(vault, "projects", "PRJ", "folder", "readme.md"),
    "# Project\nFixture",
  );
  fs.writeFileSync(
    path.join(vault, "knowledge", "guide.md"),
    "# Knowledge\nFixture",
  );
  fs.writeFileSync(
    path.join(vault, "journal", "2026-07-16.md"),
    "# Journal\nFixture",
  );
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY, number INTEGER, key TEXT, name TEXT, summary TEXT,
      phone TEXT, email TEXT, website TEXT, address TEXT, city TEXT,
      postal_code TEXT, country TEXT, avatar_storage_key TEXT,
      avatar_content_type TEXT, sort_order INTEGER, created_at INTEGER,
      updated_at INTEGER, deleted_at INTEGER
    );
    CREATE TABLE contacts (
      id TEXT PRIMARY KEY, number INTEGER, key TEXT, name TEXT, email TEXT,
      title TEXT, summary TEXT, avatar_storage_key TEXT,
      avatar_content_type TEXT, organization_id TEXT, sort_order INTEGER,
      created_at INTEGER, updated_at INTEGER, deleted_at INTEGER
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, key TEXT, name TEXT, summary TEXT, description TEXT,
      status TEXT, priority INTEGER, start_date INTEGER, due_date INTEGER,
      area TEXT, icon TEXT, color TEXT, organization_id TEXT, sort_order INTEGER,
      created_at INTEGER, updated_at INTEGER, deleted_at INTEGER
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, project_id TEXT, contact_id TEXT, assignee_id TEXT,
      number INTEGER, title TEXT, description TEXT, status TEXT,
      priority INTEGER, sort_order INTEGER, due_date INTEGER,
      completed_at INTEGER, created_at INTEGER, updated_at INTEGER,
      deleted_at INTEGER
    );
    CREATE TABLE documents (
      id TEXT PRIMARY KEY, project_id TEXT, relative_path TEXT, title TEXT,
      icon TEXT, sort_order INTEGER, created_at INTEGER, updated_at INTEGER,
      deleted_at INTEGER
    );
    CREATE TABLE knowledge_documents (
      id TEXT PRIMARY KEY, relative_path TEXT, title TEXT, icon TEXT,
      sort_order INTEGER, created_at INTEGER, updated_at INTEGER,
      deleted_at INTEGER
    );
    CREATE TABLE letters (
      id TEXT PRIMARY KEY, number INTEGER, project_id TEXT, organization_id TEXT,
      contact_id TEXT, title TEXT, icon TEXT, context TEXT, status TEXT,
      due_date INTEGER, received_date INTEGER, storage_key TEXT,
      original_filename TEXT, byte_size INTEGER, extracted_text TEXT,
      sort_order INTEGER, created_at INTEGER, updated_at INTEGER,
      deleted_at INTEGER
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, avatar_storage_key TEXT, avatar_content_type TEXT
    );
    CREATE TABLE vault_settings (id TEXT PRIMARY KEY, root_path TEXT);
    INSERT INTO vault_settings VALUES ('default', '${vault.replaceAll("'", "''")}');
    INSERT INTO organizations VALUES (
      'org-1',1,'ORG','Organization',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      NULL,NULL,0,1000,2000,NULL
    );
    INSERT INTO projects VALUES (
      'project-1','PRJ','Project',NULL,NULL,'active',1,NULL,NULL,NULL,NULL,NULL,
      'org-1',0,1000,2000,NULL
    );
    INSERT INTO documents VALUES (
      'doc-1','project-1','folder/readme','Readme',NULL,0,1000,2000,NULL
    );
    INSERT INTO knowledge_documents VALUES (
      'knowledge-1','guide','Guide',NULL,0,1000,2000,NULL
    );
  `);
  db.close();
  return { root, vault, dbPath };
}

test("source inventory validates exact Circle schema and excludes secrets", () => {
  const data = fixture();
  try {
    const snapshot = openSourceSnapshot(data.dbPath);
    assert.equal(snapshot.inventory.organizations, 1);
    assert.equal(snapshot.inventory.documents, 1);
    assert.equal(snapshot.inventory.journal_documents, 1);
    assert.equal(snapshot.inventory.vault_available, true);
    assert.ok(EXCLUDED_TABLES.includes("api_keys"));
    assert.ok(EXCLUDED_TABLES.includes("mobile_device_sessions"));
  } finally {
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});

test("record mapping preserves IDs, relationships, timestamps, and local content", async () => {
  const data = fixture();
  try {
    const snapshot = openSourceSnapshot(data.dbPath);
    const records = await buildMigrationRecords(
      snapshot,
      new CircleContentSource(snapshot.vaultRoot, {}),
      "workspace-1",
      "owner-1",
    );
    const project = records.find((record) => record.targetId === "project-1");
    const document = records.find((record) => record.targetId === "doc-1");
    const knowledge = records.find((record) => record.targetId === "knowledge-1");
    const journal = records.find(
      (record) => record.sourceType === "journal_document",
    );
    const folder = records.find(
      (record) => record.sourceType === "project_folder",
    );
    assert.equal(project?.row.organization_id, "org-1");
    assert.equal(
      (project?.row.created_at as Date).toISOString(),
      "1970-01-01T00:00:01.000Z",
    );
    assert.equal(document?.row.project_id, "project-1");
    assert.equal(document?.blob?.object?.origin, "vault");
    assert.equal(knowledge?.blob?.object?.origin, "vault");
    assert.equal(journal?.row.journal_date, "2026-07-16");
    assert.equal(folder?.row.kind, "folder");
    assert.equal(document?.row.parent_id, folder?.targetId);
  } finally {
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});
