import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOCUMENT_CONTENT_SAVE_TIMEOUT,
  mapDocumentContentLockError,
  withDocumentContentSaveTimeout,
} from "./document-content-timeout.js";

describe("document content save timeout", () => {
  it("resolves when work finishes before the deadline", async () => {
    const value = await withDocumentContentSaveTimeout(
      Promise.resolve("ok"),
      200,
    );
    assert.equal(value, "ok");
  });

  it("rejects with DOCUMENT_CONTENT_SAVE_TIMEOUT when work hangs", async () => {
    await assert.rejects(
      () =>
        withDocumentContentSaveTimeout(
          new Promise(() => {
            /* never settles */
          }),
          30,
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === DOCUMENT_CONTENT_SAVE_TIMEOUT,
    );
  });

  it("maps Postgres lock_timeout errors", () => {
    assert.throws(
      () =>
        mapDocumentContentLockError(
          new Error("canceling statement due to lock timeout"),
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === DOCUMENT_CONTENT_SAVE_TIMEOUT,
    );
  });
});
