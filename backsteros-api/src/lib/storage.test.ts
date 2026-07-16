import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPrivateStorageKey,
  buildPrivateStorageKey,
  buildStorageKey,
  checksumForContent,
} from "./storage.js";

test("storage keys are workspace scoped", () => {
  assert.equal(
    buildStorageKey("journal", "2026-07-16.md", undefined, "ws_123"),
    "workspaces/ws_123/markdown/journal/2026-07-16.md",
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
