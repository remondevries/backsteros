import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractChatMentionTokens,
  parseChatMentionToken,
} from "./chat-mention-tokens.js";

describe("parseChatMentionToken", () => {
  it("parses task / project / contact tokens", () => {
    assert.deepEqual(parseChatMentionToken("[@task:OS-144]"), {
      kind: "task",
      displayId: "OS-144",
      raw: "[@task:OS-144]",
    });
    assert.deepEqual(parseChatMentionToken("[@project:OS]"), {
      kind: "project",
      key: "OS",
      raw: "[@project:OS]",
    });
    assert.deepEqual(parseChatMentionToken("[@contact:C-1]"), {
      kind: "contact",
      key: "C-1",
      raw: "[@contact:C-1]",
    });
  });

  it("parses document and habit tokens", () => {
    assert.deepEqual(parseChatMentionToken("[@document:OS/readme.md]"), {
      kind: "document",
      projectKey: "OS",
      relativePath: "readme.md",
      raw: "[@document:OS/readme.md]",
    });
    assert.deepEqual(parseChatMentionToken("[@habit:h1/2026-01-02]"), {
      kind: "habit",
      habitId: "h1",
      date: "2026-01-02",
      raw: "[@habit:h1/2026-01-02]",
    });
  });
});

describe("extractChatMentionTokens", () => {
  it("dedupes left-to-right and keeps all kinds", () => {
    const tokens = extractChatMentionTokens(
      "Hi [@contact:remon], see [@task:OS-144] and again [@task:OS-144] + [@invoice:inv-1].",
    );
    assert.deepEqual(
      tokens.map((token) => token.raw),
      ["[@contact:remon]", "[@task:OS-144]", "[@invoice:inv-1]"],
    );
  });
});
