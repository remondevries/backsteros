import { describe, expect, it } from "vitest";

import {
  authorizationHeaderFromWebhookKey,
  readFileTaskCallbackResult,
  registerFileTaskRequest,
  storeFileTaskCallbackResult,
} from "./file-task-callback.ts";

describe("file-task-callback", () => {
  it("normalizes webhook Authorization headers", () => {
    expect(authorizationHeaderFromWebhookKey("secret-token")).toBe("Bearer secret-token");
    expect(authorizationHeaderFromWebhookKey("Bearer already")).toBe("Bearer already");
    expect(authorizationHeaderFromWebhookKey("Basic abc")).toBe("Basic abc");
  });

  it("stores and reads callback results by requestId", () => {
    registerFileTaskRequest("req-1");
    expect(readFileTaskCallbackResult("req-1")).toBeNull();

    const stored = storeFileTaskCallbackResult({
      ok: true,
      requestId: "req-1",
      taskRef: "BDV-99",
      summary: "Filed from test",
    });
    expect(stored.accepted).toBe(true);
    expect(readFileTaskCallbackResult("req-1")).toEqual({
      ok: true,
      requestId: "req-1",
      taskRef: "BDV-99",
      summary: "Filed from test",
    });

    expect(
      storeFileTaskCallbackResult({
        ok: false,
        requestId: "req-1",
        error: "duplicate",
      }).accepted,
    ).toBe(false);
  });
});
