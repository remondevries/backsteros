import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiClientError } from "@backsteros/api-client";

import {
  discardDocumentContentCache,
  writeDocumentContentCache,
} from "./document-content-cache.ts";
import {
  DOCUMENT_CONTENT_VERSION_CONFLICT_MESSAGE,
  saveVerifiedDocumentContent,
  shouldSkipDocumentContentSave,
} from "./document-content-save.ts";

describe("document content save guards", () => {
  it("shouldSkipDocumentContentSave is true when unchanged", () => {
    assert.equal(shouldSkipDocumentContentSave("a", "a"), true);
    assert.equal(shouldSkipDocumentContentSave("a", "b"), false);
    assert.equal(shouldSkipDocumentContentSave("a", null), false);
  });

  it("skips PATCH when body equals last saved", async () => {
    let requestCount = 0;
    const client = {
      requestJson: async () => {
        requestCount += 1;
        return { content: "x", contentVersion: 2 };
      },
    };
    const result = await saveVerifiedDocumentContent({
      client: client as never,
      documentId: "doc-1",
      content: "same",
      contentVersion: 1,
      lastSavedContent: "same",
    });
    assert.equal(requestCount, 0);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.skipped, true);
  });

  it("refuses save when contentVersion is unverified", async () => {
    let requestCount = 0;
    const client = {
      requestJson: async () => {
        requestCount += 1;
        return { content: "x", contentVersion: 2 };
      },
    };
    const result = await saveVerifiedDocumentContent({
      client: client as never,
      documentId: "doc-1",
      content: "body",
      contentVersion: undefined,
      lastSavedContent: null,
    });
    assert.equal(requestCount, 0);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /not verified/i);
    }
  });

  it("on version conflict refetches and returns a clear message", async () => {
    const id = `doc-conflict-${Date.now()}`;
    let patchCount = 0;
    let getCount = 0;
    const client = {
      requestJson: async (path: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          patchCount += 1;
          throw new ApiClientError(
            409,
            { error: "Conflict", code: "CONTENT_VERSION_CONFLICT" },
            new Headers(),
          );
        }
        getCount += 1;
        assert.match(path, new RegExp(`/documents/${id}/content`));
        return {
          content: "# fresh from server\n\n## Ownership\n",
          contentVersion: 32,
          checksum: "abc",
        };
      },
    };

    writeDocumentContentCache(id, {
      content: "# stale",
      contentVersion: 31,
      checksum: "old",
    });

    const result = await saveVerifiedDocumentContent({
      client: client as never,
      documentId: id,
      content: "# edited",
      contentVersion: 31,
      lastSavedContent: "# stale",
    });

    assert.equal(patchCount, 1);
    assert.equal(getCount, 1);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.conflict, true);
      assert.equal(result.error, DOCUMENT_CONTENT_VERSION_CONFLICT_MESSAGE);
      assert.equal(result.content, "# fresh from server\n\n## Ownership\n");
      assert.equal(result.contentVersion, 32);
    }
    discardDocumentContentCache(id);
  });
});
