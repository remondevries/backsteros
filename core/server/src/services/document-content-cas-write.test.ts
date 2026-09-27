import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareAndSwapDocumentContent,
  type DocumentContentCasDeps,
  type DocumentContentCasMeta,
} from "./document-content-cas-write.js";
import { DOCUMENT_CONTENT_SAVE_TIMEOUT } from "./document-content-timeout.js";

type MemoryDoc = {
  contentVersion: number;
  storageKey: string;
  byteSize: number;
  content: string;
  checksum: string | null;
  snippet: string | null;
  contentEtag: string | null;
};

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createLockedHarness(
  initial: MemoryDoc,
  options?: { saveTimeoutMs?: number },
) {
  const doc: MemoryDoc = { ...initial };
  const putBodies: string[] = [];
  let putHold = deferred();
  putHold.resolve();
  let lock: Promise<void> = Promise.resolve();
  let lockHeld = deferred();
  lockHeld.resolve();
  let lockReleasedCount = 0;

  function holdPuts() {
    putHold = deferred();
  }

  function releasePuts() {
    putHold.resolve();
  }

  /** Resolves when a save has acquired the row lock (before putObject). */
  function watchLockHeld() {
    lockHeld = deferred();
    return lockHeld.promise;
  }

  const deps: DocumentContentCasDeps = {
    saveTimeoutMs: options?.saveTimeoutMs,
    withLockedRow: async (fn) => {
      // Exclusive mutex = Postgres FOR UPDATE for the whole save.
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((res) => {
        release = res;
      });
      await previous;
      try {
        const observedVersion = doc.contentVersion;
        lockHeld.resolve();
        return await fn({
          existing: {
            contentVersion: observedVersion,
            storageKey: doc.storageKey,
            byteSize: doc.byteSize,
          },
          writeMeta: async (meta) => {
            if (doc.contentVersion !== observedVersion) {
              return null;
            }
            doc.contentVersion = observedVersion + 1;
            doc.byteSize = meta.byteSize;
            doc.checksum = meta.checksum;
            doc.snippet = meta.snippet;
            doc.contentEtag = meta.contentEtag;
            return {
              contentVersion: doc.contentVersion,
              ...meta,
            };
          },
        });
      } finally {
        lockReleasedCount += 1;
        release();
      }
    },
    putObject: async (_key, content) => {
      await putHold.promise;
      putBodies.push(content);
      doc.content = content;
      const byteSize = Buffer.byteLength(content, "utf8");
      return { etag: `etag-${byteSize}`, byteSize };
    },
    checksumForContent: (content) => `sum:${content.length}`,
    snippetForContent: (content) => content.slice(0, 32),
  };

  async function save(
    content: string,
    ifMatchVersion: number,
  ): Promise<DocumentContentCasMeta | Error> {
    try {
      const result = await compareAndSwapDocumentContent(
        { content, ifMatchVersion },
        deps,
      );
      assert.ok(result, "expected CAS write result");
      return result;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  return {
    doc,
    putBodies,
    holdPuts,
    releasePuts,
    watchLockHeld,
    save,
    getLockReleasedCount: () => lockReleasedCount,
  };
}

describe("updateDocumentContent row-locked CAS race", () => {
  it("rejects older ifMatchVersion=N before any write while newer N+1 wins", async () => {
    const N = 7;
    const harness = createLockedHarness({
      contentVersion: N + 1,
      storageKey: "docs/race.md",
      byteSize: "NEWER_ON_DISK".length,
      content: "NEWER_ON_DISK",
      checksum: "sum:13",
      snippet: "NEWER_ON_DISK",
      contentEtag: "etag-13",
    });

    harness.holdPuts();
    const locked = harness.watchLockHeld();
    const newerPromise = harness.save("FRESH_BODY", N + 1);
    await locked;

    // Older blocks on the row lock until newer finishes, then conflicts.
    const olderPromise = harness.save("STALE_BODY", N);
    assert.deepEqual(harness.putBodies, []);

    harness.releasePuts();
    const newerResult = await newerPromise;
    const olderResult = await olderPromise;
    assert.ok(!(newerResult instanceof Error));
    assert.ok(olderResult instanceof Error, "older save must reject");
    assert.equal(olderResult.message, "CONTENT_VERSION_CONFLICT");
    assert.equal(harness.putBodies.includes("STALE_BODY"), false);
    assert.equal(harness.doc.content, "FRESH_BODY");
    assert.equal(harness.doc.contentVersion, N + 2);
    assert.deepEqual(harness.putBodies, ["FRESH_BODY"]);
  });

  it("claim-to-write window: locked older save cannot be interleaved; newer content wins", async () => {
    const N = 3;
    const harness = createLockedHarness({
      contentVersion: N,
      storageKey: "docs/window.md",
      byteSize: "BASE".length,
      content: "BASE",
      checksum: "sum:4",
      snippet: "BASE",
      contentEtag: "etag-4",
    });

    // Older save holds the row lock through a slow putObject (the former
    // claim-then-write hole). Newer must not write during that window.
    harness.holdPuts();
    const olderLocked = harness.watchLockHeld();
    const olderPromise = harness.save("OLD_BODY", N);
    await olderLocked;

    // Newer arrives during the lock-held window with the same ifMatch.
    // It blocks on the mutex until older finishes, then conflicts.
    const newerDuringWindow = harness.save("NEW_BODY", N);

    // While older still holds the lock, storage must stay BASE (no interleave).
    assert.equal(harness.doc.content, "BASE");
    assert.deepEqual(harness.putBodies, []);

    harness.releasePuts();
    const olderResult = await olderPromise;
    assert.ok(!(olderResult instanceof Error));
    assert.equal(harness.doc.content, "OLD_BODY");
    assert.equal(harness.doc.contentVersion, N + 1);

    const staleRetry = await newerDuringWindow;
    assert.ok(staleRetry instanceof Error);
    assert.equal(staleRetry.message, "CONTENT_VERSION_CONFLICT");
    assert.equal(harness.putBodies.includes("NEW_BODY"), false);

    // Client refreshes ifMatch to N+1 and saves the newer body — it sticks.
    const newerResult = await harness.save("NEW_BODY", N + 1);
    assert.ok(!(newerResult instanceof Error));
    assert.equal(harness.doc.content, "NEW_BODY");
    assert.equal(harness.doc.contentVersion, N + 2);
    assert.deepEqual(harness.putBodies, ["OLD_BODY", "NEW_BODY"]);
    // Newer content always ends last — never overwritten by a late stale put.
    assert.equal(harness.putBodies.at(-1), "NEW_BODY");
  });

  it("times out a hung save, releases the lock, and fails cleanly", async () => {
    const N = 1;
    const harness = createLockedHarness(
      {
        contentVersion: N,
        storageKey: "docs/timeout.md",
        byteSize: "BASE".length,
        content: "BASE",
        checksum: "sum:4",
        snippet: "BASE",
        contentEtag: "etag-4",
      },
      { saveTimeoutMs: 40 },
    );

    harness.holdPuts();
    const locked = harness.watchLockHeld();
    const hung = harness.save("NEVER_WRITTEN", N);
    await locked;

    const result = await hung;
    assert.ok(result instanceof Error);
    assert.equal(result.message, DOCUMENT_CONTENT_SAVE_TIMEOUT);
    assert.equal(harness.getLockReleasedCount(), 1, "lock must be released");
    assert.equal(harness.doc.contentVersion, N, "version must not bump on timeout");

    // After timeout, another save can acquire the lock and succeed.
    harness.releasePuts();
    const retry = await harness.save("AFTER_TIMEOUT", N);
    assert.ok(!(retry instanceof Error), String(retry));
    assert.equal(harness.doc.content, "AFTER_TIMEOUT");
    assert.equal(harness.doc.contentVersion, N + 1);
  });
});
