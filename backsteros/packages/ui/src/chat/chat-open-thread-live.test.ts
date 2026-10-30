import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isOpenChatThreadEvent,
  shouldRefreshOpenChatThreadOnPush,
} from "./chat-open-thread-live.js";

describe("isOpenChatThreadEvent", () => {
  it("matches the open thread id", () => {
    assert.equal(isOpenChatThreadEvent("th_1", "th_1"), true);
    assert.equal(isOpenChatThreadEvent(" th_1 ", "th_1"), true);
    assert.equal(isOpenChatThreadEvent("th_1", "th_2"), false);
    assert.equal(isOpenChatThreadEvent(null, "th_1"), false);
  });
});

describe("shouldRefreshOpenChatThreadOnPush", () => {
  it("refreshes on message for the open thread", () => {
    assert.equal(
      shouldRefreshOpenChatThreadOnPush({
        openThreadId: "th_1",
        eventThreadId: "th_1",
        kind: "message",
      }),
      true,
    );
  });

  it("refreshes on idle status, not on working", () => {
    assert.equal(
      shouldRefreshOpenChatThreadOnPush({
        openThreadId: "th_1",
        eventThreadId: "th_1",
        kind: "status",
        status: "idle",
      }),
      true,
    );
    assert.equal(
      shouldRefreshOpenChatThreadOnPush({
        openThreadId: "th_1",
        eventThreadId: "th_1",
        kind: "status",
        status: "working",
      }),
      false,
    );
  });

  it("ignores other threads", () => {
    assert.equal(
      shouldRefreshOpenChatThreadOnPush({
        openThreadId: "th_1",
        eventThreadId: "th_other",
        kind: "message",
      }),
      false,
    );
  });
});
