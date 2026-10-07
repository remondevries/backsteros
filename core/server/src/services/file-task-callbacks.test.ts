import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFileTaskCallbackUrl,
  hashFileTaskCallbackToken,
  parseFileTaskCallbackResult,
  resolveFileTaskCallbackPublicBase,
  tokenHashesEqual,
} from "./file-task-callback-parse.js";

describe("file-task-callback-parse", () => {
  it("builds a public callback URL with the token in the query", () => {
    assert.equal(
      buildFileTaskCallbackUrl(
        "req-1",
        "ftc_secret",
        "https://agent.backsteros.com",
      ),
      "https://agent.backsteros.com/api/v1/public/file-task-callbacks/req-1?token=ftc_secret",
    );
  });

  it("ignores dead staging AGENTS_PUBLIC_URL when resolving the public base (OS-100)", () => {
    const previousAgents = process.env.AGENTS_PUBLIC_URL;
    const previousFile = process.env.FILE_TASK_CALLBACK_PUBLIC_URL;
    process.env.AGENTS_PUBLIC_URL = "https://staging.backsteros.com";
    delete process.env.FILE_TASK_CALLBACK_PUBLIC_URL;
    try {
      assert.equal(
        resolveFileTaskCallbackPublicBase(),
        "https://agent.backsteros.com",
      );
    } finally {
      if (previousAgents === undefined) delete process.env.AGENTS_PUBLIC_URL;
      else process.env.AGENTS_PUBLIC_URL = previousAgents;
      if (previousFile === undefined) {
        delete process.env.FILE_TASK_CALLBACK_PUBLIC_URL;
      } else {
        process.env.FILE_TASK_CALLBACK_PUBLIC_URL = previousFile;
      }
    }
  });

  it("parses success and failure callback bodies", () => {
    assert.deepEqual(
      parseFileTaskCallbackResult({
        ok: true,
        requestId: "req-1",
        taskRef: "BDV-28",
        taskId: "task_1",
      }),
      {
        ok: true,
        requestId: "req-1",
        taskRef: "BDV-28",
        taskId: "task_1",
      },
    );
    assert.deepEqual(
      parseFileTaskCallbackResult({
        ok: false,
        requestId: "req-1",
        error: "Could not file",
      }),
      { ok: false, requestId: "req-1", error: "Could not file" },
    );
    assert.equal(parseFileTaskCallbackResult({ ok: true }), null);
    assert.equal(parseFileTaskCallbackResult({ requestId: "req-1" }), null);
  });

  it("compares token hashes in constant time", () => {
    const hash = hashFileTaskCallbackToken("ftc_secret");
    assert.equal(tokenHashesEqual(hash, hash), true);
    assert.equal(tokenHashesEqual(hash, hashFileTaskCallbackToken("other")), false);
    assert.equal(tokenHashesEqual("not-hex", hash), false);
  });
});
