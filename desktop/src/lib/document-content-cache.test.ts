import assert from "node:assert/strict";
import { test } from "node:test";

import {
  discardDocumentContentCache,
  fetchDocumentContent,
  shouldMissDocumentContentCache,
  writeDocumentContentCache,
} from "./document-content-cache.ts";

test("shouldMissDocumentContentCache misses when cache empty", () => {
  assert.equal(shouldMissDocumentContentCache(null), true);
  assert.equal(shouldMissDocumentContentCache(undefined), true);
});

test("shouldMissDocumentContentCache misses pre-v2 entries without checksum", () => {
  assert.equal(
    shouldMissDocumentContentCache({
      content: "# old",
      contentVersion: 3,
    }),
    true,
  );
  assert.equal(
    shouldMissDocumentContentCache({
      content: "# old",
      contentVersion: 3,
      checksum: null,
    }),
    true,
  );
});

test("shouldMissDocumentContentCache keeps hit when checksum matches known", () => {
  assert.equal(
    shouldMissDocumentContentCache(
      {
        content: "# body",
        contentVersion: 5,
        checksum: "abc",
      },
      "abc",
    ),
    false,
  );
});

test("shouldMissDocumentContentCache misses when checksum drifted", () => {
  assert.equal(
    shouldMissDocumentContentCache(
      {
        content: "# stale",
        contentVersion: 5,
        checksum: "old",
      },
      "new",
    ),
    true,
  );
});

test("shouldMissDocumentContentCache keeps hit when no known checksum yet", () => {
  // Open path always revalidates via network; peek may still first-paint.
  assert.equal(
    shouldMissDocumentContentCache({
      content: "# body",
      contentVersion: 5,
      checksum: "abc",
    }),
    false,
  );
});

test("fetchDocumentContent always revalidates — never returns warm LRU as final", async () => {
  const id = `doc-revalidate-${Date.now()}`;
  writeDocumentContentCache(id, {
    content: "# stale-cache",
    contentVersion: 1,
    checksum: "stale",
  });

  let requestCount = 0;
  const client = {
    requestJson: async () => {
      requestCount += 1;
      return {
        content: "# from-server",
        contentVersion: 2,
        checksum: "fresh",
      };
    },
  };

  const result = await fetchDocumentContent(client as never, id);
  assert.equal(requestCount, 1);
  assert.equal(result?.content, "# from-server");
  assert.equal(result?.contentVersion, 2);
  assert.equal(result?.checksum, "fresh");
  discardDocumentContentCache(id);
});
