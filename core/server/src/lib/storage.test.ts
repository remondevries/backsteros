import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPrivateStorageKey,
  buildLetterPdfStorageKey,
  buildPrivateStorageKey,
  buildStorageKey,
  checksumForContent,
  isSpacesConfigured,
  isStorageConfigured,
  setVaultPathCache,
} from "./storage.js";

test("isStorageConfigured uses vault path cache or env", () => {
  const previousEnv = process.env.BACKSTEROS_VAULT_PATH;
  const previousCache = null;
  setVaultPathCache(null);
  delete process.env.BACKSTEROS_VAULT_PATH;
  assert.equal(isStorageConfigured(), false);
  assert.equal(isSpacesConfigured(), false);

  setVaultPathCache("/tmp/backsteros-vault");
  assert.equal(isStorageConfigured(), true);

  setVaultPathCache(null);
  process.env.BACKSTEROS_VAULT_PATH = "/tmp/from-env";
  assert.equal(isStorageConfigured(), true);

  setVaultPathCache(previousCache);
  if (previousEnv === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
  else process.env.BACKSTEROS_VAULT_PATH = previousEnv;
});

test("storage keys follow Obsidian vault layout", () => {
  assert.equal(
    buildStorageKey("journal", "2026-07-16.md", undefined, "ws_123"),
    "Journal/2026-07-16.md",
  );
  assert.equal(
    buildStorageKey("knowledge", "../evil/secrets.md", undefined, "ws_123"),
    "Knowledge Base/evil/secrets.md",
  );
  assert.equal(
    buildStorageKey("project", "notes/../readme.md", "proj/../key", "ws_123"),
    "Projects/proj_.._key/Documents/notes/readme.md",
  );
  assert.equal(
    buildPrivateStorageKey("ws_123", "pdfs", "letter_1", "../../letter.pdf"),
    ".backsteros/pdfs/letter_1/_.._letter.pdf",
  );
  assert.equal(
    buildPrivateStorageKey("ws_123", "avatars", "contact_1", "avatar"),
    ".backsteros/avatars/contact_1/avatar",
  );
  assert.equal(
    buildLetterPdfStorageKey({
      title: "Tax return",
      receivedDate: new Date("2026-07-26T12:00:00Z"),
      attachmentId: "att_abcdefgh",
    }),
    "Letters/2026/07/2026-07-26 - Tax return (att_abcd).pdf",
  );
  assert.doesNotThrow(() =>
    assertPrivateStorageKey(
      "ws_123",
      ".backsteros/avatars/contact_1/avatar",
    ),
  );
  assert.throws(
    () => assertPrivateStorageKey("ws_123", "../outside/avatar"),
    /STORAGE_KEY_OUTSIDE_WORKSPACE/,
  );
});

test("checksums support text and binary content", () => {
  const text = "BacksterOS";
  assert.equal(checksumForContent(text), checksumForContent(Buffer.from(text)));
});
