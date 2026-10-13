import assert from "node:assert/strict";
import { test } from "node:test";

import {
  discardDocumentContentCache,
  fetchDocumentContent,
  isDocumentContentChecksumCorrupt,
  peekDocumentContentCache,
  sha256HexUtf8,
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

test("shouldMissDocumentContentCache misses when no known checksum yet", () => {
  assert.equal(
    shouldMissDocumentContentCache({
      content: "# body",
      contentVersion: 5,
      checksum: "abc",
    }),
    true,
  );
});

test("isDocumentContentChecksumCorrupt detects etag/body mismatch", async () => {
  const content = "# short body";
  const real = await sha256HexUtf8(content);
  assert.equal(
    await isDocumentContentChecksumCorrupt({
      content,
      contentVersion: 1,
      checksum: real,
    }),
    false,
  );
  assert.equal(
    await isDocumentContentChecksumCorrupt({
      content,
      contentVersion: 1,
      checksum: "a".repeat(64),
    }),
    true,
  );
});

test("fetchDocumentContent returns warm LRU without REST when checksum trusted", async () => {
  const id = `doc-local-first-${Date.now()}`;
  const content = "# cached";
  const checksum = await sha256HexUtf8(content);
  writeDocumentContentCache(id, {
    content,
    contentVersion: 1,
    checksum,
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

  const result = await fetchDocumentContent(client as never, id, {
    knownChecksum: checksum,
  });
  assert.equal(requestCount, 0);
  assert.equal(result?.content, "# cached");
  assert.equal(result?.contentVersion, 1);
  discardDocumentContentCache(id);
});

test("fetchDocumentContent with null knownChecksum skips vault/cache and hits REST", async () => {
  const id = `doc-null-checksum-${Date.now()}`;
  const content = "# cached";
  const checksum = await sha256HexUtf8(content);
  writeDocumentContentCache(id, {
    content,
    contentVersion: 1,
    checksum,
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

  const result = await fetchDocumentContent(client as never, id, {
    knownChecksum: null,
    storageKey: "Projects/HT/Documents/household-documentation.md",
    contentVersion: 31,
  });
  assert.equal(requestCount, 1);
  assert.equal(result?.content, "# from-server");
  discardDocumentContentCache(id);
});

test("fetchDocumentContent drops poisoned LRU (etag matches, body does not) and hits REST", async () => {
  const id = `doc-poison-${Date.now()}`;
  const fullBody = "# full document\n\n## One\n\n## Two\n";
  const fullChecksum = await sha256HexUtf8(fullBody);
  // Same failure mode as Household docs: short body stored with full etag.
  writeDocumentContentCache(id, {
    content: "# short\n\n## Only\n",
    contentVersion: 31,
    checksum: fullChecksum,
  });

  let requestCount = 0;
  const client = {
    requestJson: async () => {
      requestCount += 1;
      return {
        content: fullBody,
        contentVersion: 31,
        checksum: fullChecksum,
      };
    },
  };

  const result = await fetchDocumentContent(client as never, id, {
    knownChecksum: fullChecksum,
  });
  assert.equal(requestCount, 1);
  assert.equal(result?.content, fullBody);
  assert.equal(result?.checksum, fullChecksum);
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
