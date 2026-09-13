import assert from "node:assert/strict";
import { test } from "node:test";

import {
  discardDocumentContentCache,
  fetchDocumentContent,
  peekDocumentContentCache,
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
  assert.equal(
    shouldMissDocumentContentCache({
      content: "# body",
      contentVersion: 5,
      checksum: "abc",
    }),
    false,
  );
});

test("fetchDocumentContent returns warm LRU without REST when checksum trusted", async () => {
  const id = `doc-local-first-${Date.now()}`;
  writeDocumentContentCache(id, {
    content: "# cached",
    contentVersion: 1,
    checksum: "abc",
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
  assert.equal(requestCount, 0);
  assert.equal(result?.content, "# cached");
  assert.equal(result?.contentVersion, 1);
  discardDocumentContentCache(id);
});

test("fetchDocumentContent force bypasses warm LRU and hits REST", async () => {
  const id = `doc-force-${Date.now()}`;
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

  const result = await fetchDocumentContent(client as never, id, { force: true });
  assert.equal(requestCount, 1);
  assert.equal(result?.content, "# from-server");
  assert.equal(result?.contentVersion, 2);
  assert.equal(result?.checksum, "fresh");
  discardDocumentContentCache(id);
});

test("discardDocumentContentCache clears warm entry for SSE force refetch", () => {
  const id = `doc-discard-${Date.now()}`;
  writeDocumentContentCache(id, {
    content: "# stale",
    contentVersion: 1,
    checksum: "abc",
  });
  assert.ok(peekDocumentContentCache(id));
  discardDocumentContentCache(id);
  assert.equal(peekDocumentContentCache(id), null);
});
