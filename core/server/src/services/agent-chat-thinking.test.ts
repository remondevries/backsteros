import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHAT_THREAD_WORKING_STALE_MS,
  isChatThreadPendingReplyStale,
} from "./agent-chat.js";

describe("isChatThreadPendingReplyStale", () => {
  it("treats null as not stale", () => {
    assert.equal(isChatThreadPendingReplyStale(null), false);
  });

  it("expires after the working stale window", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    const fresh = new Date(now.getTime() - 30_000);
    const stale = new Date(now.getTime() - CHAT_THREAD_WORKING_STALE_MS - 1);
    assert.equal(isChatThreadPendingReplyStale(fresh, now), false);
    assert.equal(isChatThreadPendingReplyStale(stale, now), true);
  });
});
