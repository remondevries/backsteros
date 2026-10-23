import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import type { AgentMailMessageDetail } from "@backsteros/contracts";

import {
  discardEmailMessageDetailCache,
  isEmailMessageDetailCacheStale,
  peekEmailMessageDetailCache,
  writeEmailMessageDetailCache,
} from "./email-message-detail-cache.js";

function sampleDetail(
  messageId: string,
): AgentMailMessageDetail {
  return {
    kind: "message",
    inboxId: "inbox-1",
    messageId,
    subject: "Hello",
    from: "a@example.com",
    preview: "Hi",
    timestamp: new Date().toISOString(),
    text: "Hi",
    html: null,
    extractedText: null,
    extractedHtml: null,
  } as AgentMailMessageDetail;
}

describe("email-message-detail-cache", () => {
  beforeEach(() => {
    discardEmailMessageDetailCache("inbox-1", "msg-1");
    discardEmailMessageDetailCache("inbox-1", "msg-2");
  });

  it("peeks written message detail", () => {
    writeEmailMessageDetailCache("inbox-1", "msg-1", sampleDetail("msg-1"));
    assert.equal(
      peekEmailMessageDetailCache("inbox-1", "msg-1")?.messageId,
      "msg-1",
    );
    assert.equal(isEmailMessageDetailCacheStale("inbox-1", "msg-1"), false);
  });

  it("reports missing entries as stale", () => {
    assert.equal(isEmailMessageDetailCacheStale("inbox-1", "missing"), true);
  });

  it("discards a cached message", () => {
    writeEmailMessageDetailCache("inbox-1", "msg-2", sampleDetail("msg-2"));
    discardEmailMessageDetailCache("inbox-1", "msg-2");
    assert.equal(peekEmailMessageDetailCache("inbox-1", "msg-2"), null);
  });
});
