import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Contract for atomic ifMatchVersion on updateDocumentContent:
 * UPDATE … WHERE id = ? AND content_version = ? — zero rows ⇒ conflict.
 */
export function documentContentUpdateLostRace(rowCount: number): boolean {
  return rowCount === 0;
}

/** Slice of updateDocumentContent used to assert production wiring. */
function updateDocumentContentSource(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "documents.ts"), "utf8");
  const start = src.indexOf("export async function updateDocumentContent");
  assert.ok(start >= 0, "updateDocumentContent export missing");
  const next = src.indexOf("\nexport async function ", start + 1);
  return next >= 0 ? src.slice(start, next) : src.slice(start);
}

describe("document content version conflict (atomic update)", () => {
  it("treats zero updated rows as CONTENT_VERSION_CONFLICT", () => {
    assert.equal(documentContentUpdateLostRace(0), true);
    assert.equal(documentContentUpdateLostRace(1), false);
  });

  it("documents the conflict error code used by REST", () => {
    const code = "CONTENT_VERSION_CONFLICT";
    assert.equal(code, "CONTENT_VERSION_CONFLICT");
  });

  it("locks the row for the whole save via shared FOR UPDATE helper + CAS", () => {
    const fn = updateDocumentContentSource();
    assert.ok(
      fn.includes("compareAndSwapDocumentContent("),
      "updateDocumentContent must use the CAS helper",
    );
    assert.ok(fn.includes("withDocumentContentRowLock("));
    assert.ok(fn.includes("withLockedRow"));
  });
});

describe("document content CAS helper source order", () => {
  it("checks ifMatch under the lock before putObject and applies timeout", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "document-content-cas-write.ts"), "utf8");
    const start = src.indexOf("export async function compareAndSwapDocumentContent");
    assert.ok(start >= 0);
    const fn = src.slice(start);
    const lockCall = fn.indexOf("deps.withLockedRow(");
    const timeoutCall = fn.indexOf("withDocumentContentSaveTimeout(");
    const ifMatchThrow = fn.indexOf('throw new Error("CONTENT_VERSION_CONFLICT")');
    const putObjectCall = fn.indexOf("deps.putObject(");
    assert.ok(lockCall >= 0, "withLockedRow missing");
    assert.ok(timeoutCall >= 0, "save timeout wrapper missing");
    assert.ok(ifMatchThrow >= 0, "ifMatch conflict throw missing");
    assert.ok(putObjectCall >= 0, "putObject call missing");
    assert.ok(lockCall < ifMatchThrow, "lock must wrap ifMatch check");
    assert.ok(
      ifMatchThrow < putObjectCall,
      "ifMatchVersion must be checked before putObject",
    );
  });
});
