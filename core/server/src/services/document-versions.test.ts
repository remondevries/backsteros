import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  serializeDocumentVersion,
  type DocumentVersionRow,
} from "./document-versions.js";

const here = dirname(fileURLToPath(import.meta.url));

function documentsSource(): string {
  return readFileSync(join(here, "documents.ts"), "utf8");
}

function sampleRow(
  overrides: Partial<DocumentVersionRow> = {},
): DocumentVersionRow {
  const now = new Date("2026-11-24T12:00:00.000Z");
  return {
    id: "ver_1",
    workspaceId: "ws_1",
    documentId: "doc_1",
    contentVersion: 3,
    content: "hello\nworld",
    actorKind: "user",
    actorUserId: "user_1",
    actorContactId: "contact_1",
    actorName: "Remon",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe("document_versions (OS-204)", () => {
  it("serializeDocumentVersion exposes ISO timestamps and content", () => {
    const json = serializeDocumentVersion(sampleRow());
    assert.equal(json.contentVersion, 3);
    assert.equal(json.content, "hello\nworld");
    assert.equal(json.createdAt, "2026-11-24T12:00:00.000Z");
    assert.equal(json.updatedAt, "2026-11-24T12:00:00.000Z");
    assert.equal(json.documentId, "doc_1");
  });

  it("updateDocumentContent upserts a version row in the content CAS write path", () => {
    const src = documentsSource();
    const start = src.indexOf("export async function updateDocumentContent");
    assert.ok(start >= 0, "updateDocumentContent export missing");
    const next = src.indexOf("\nexport async function", start + 1);
    const fn = src.slice(start, next > start ? next : undefined);
    assert.match(fn, /upsertDocumentVersion/);
    assert.match(fn, /contentVersion:\s*updated\.contentVersion/);
    assert.match(fn, /content:\s*contentForWrite/);
  });
});
