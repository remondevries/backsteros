import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  clearAgentMailMessageDetailCache,
  invalidateAgentMailMessageDetailCache,
  peekAgentMailMessageDetailCache,
  writeAgentMailMessageDetailCache,
} from "./agentmail-message-detail-cache.js";

describe("agentmail-message-detail-cache", () => {
  beforeEach(() => {
    clearAgentMailMessageDetailCache();
  });

  it("stores and peeks a detail payload", () => {
    writeAgentMailMessageDetailCache("ws", "inbox", "msg", { ok: true });
    assert.deepEqual(
      peekAgentMailMessageDetailCache("ws", "inbox", "msg"),
      { ok: true },
    );
  });

  it("invalidates a single message", () => {
    writeAgentMailMessageDetailCache("ws", "inbox", "msg-a", { a: 1 });
    writeAgentMailMessageDetailCache("ws", "inbox", "msg-b", { b: 2 });
    invalidateAgentMailMessageDetailCache("ws", "inbox", "msg-a");
    assert.equal(peekAgentMailMessageDetailCache("ws", "inbox", "msg-a"), null);
    assert.deepEqual(
      peekAgentMailMessageDetailCache("ws", "inbox", "msg-b"),
      { b: 2 },
    );
  });

  it("invalidates a whole inbox when messageId is omitted", () => {
    writeAgentMailMessageDetailCache("ws", "inbox", "msg-a", { a: 1 });
    writeAgentMailMessageDetailCache("ws", "inbox", "msg-b", { b: 2 });
    writeAgentMailMessageDetailCache("ws", "other", "msg-c", { c: 3 });
    invalidateAgentMailMessageDetailCache("ws", "inbox");
    assert.equal(peekAgentMailMessageDetailCache("ws", "inbox", "msg-a"), null);
    assert.equal(peekAgentMailMessageDetailCache("ws", "inbox", "msg-b"), null);
    assert.deepEqual(
      peekAgentMailMessageDetailCache("ws", "other", "msg-c"),
      { c: 3 },
    );
  });
});
