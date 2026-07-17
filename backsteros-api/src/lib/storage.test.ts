import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPrivateStorageKey,
  buildPrivateStorageKey,
  buildStorageKey,
  checksumForContent,
  isSpacesConfigured,
} from "./storage.js";

test("isSpacesConfigured requires all Spaces credentials", () => {
  const previous = {
    SPACES_ENDPOINT: process.env.SPACES_ENDPOINT,
    SPACES_BUCKET: process.env.SPACES_BUCKET,
    SPACES_ACCESS_KEY_ID: process.env.SPACES_ACCESS_KEY_ID,
    SPACES_SECRET_ACCESS_KEY: process.env.SPACES_SECRET_ACCESS_KEY,
  };

  delete process.env.SPACES_ENDPOINT;
  delete process.env.SPACES_BUCKET;
  delete process.env.SPACES_ACCESS_KEY_ID;
  delete process.env.SPACES_SECRET_ACCESS_KEY;
  assert.equal(isSpacesConfigured(), false);

  process.env.SPACES_ENDPOINT = "https://ams3.digitaloceanspaces.com";
  process.env.SPACES_BUCKET = "backsteros";
  process.env.SPACES_ACCESS_KEY_ID = "key";
  process.env.SPACES_SECRET_ACCESS_KEY = "secret";
  assert.equal(isSpacesConfigured(), true);

  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("storage keys are workspace scoped", () => {
  assert.equal(
    buildStorageKey("journal", "2026-07-16.md", undefined, "ws_123"),
    "workspaces/ws_123/markdown/journal/2026-07-16.md",
  );
  assert.equal(
    buildStorageKey("knowledge", "../evil/secrets.md", undefined, "ws_123"),
    "workspaces/ws_123/markdown/knowledge/evil/secrets.md",
  );
  assert.equal(
    buildStorageKey("project", "notes/../readme.md", "proj/../key", "ws_123"),
    "workspaces/ws_123/markdown/projects/proj_.._key/notes/readme.md",
  );
  assert.equal(
    buildPrivateStorageKey("ws_123", "pdfs", "letter_1", "../../letter.pdf"),
    "workspaces/ws_123/private/pdfs/letter_1/.._.._letter.pdf",
  );
  assert.doesNotThrow(() =>
    assertPrivateStorageKey(
      "ws_123",
      "workspaces/ws_123/private/avatars/contact_1/avatar",
    ),
  );
  assert.throws(
    () =>
      assertPrivateStorageKey(
        "ws_123",
        "workspaces/another/private/avatars/contact_1/avatar",
      ),
    /STORAGE_KEY_OUTSIDE_WORKSPACE/,
  );
});

test("checksums support text and binary content", () => {
  const text = "BacksterOS";
  assert.equal(checksumForContent(text), checksumForContent(Buffer.from(text)));
});
