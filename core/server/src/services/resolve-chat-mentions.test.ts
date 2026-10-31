import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractChatMentionTokens } from "../lib/chat-mention-tokens.js";

describe("resolveChatMentionsInBody (token extract contract)", () => {
  it("feeds webhook/API mentions from body without mutating body", () => {
    const body =
      "Please check [@task:OS-144] with [@contact:C-1] and [@project:OS].";
    const tokens = extractChatMentionTokens(body);
    assert.equal(body.includes("[@task:OS-144]"), true);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[0]?.kind, "task");
    assert.equal(tokens[1]?.kind, "contact");
    assert.equal(tokens[2]?.kind, "project");
  });

  it("returns empty for bodies without mentions", () => {
    assert.deepEqual(extractChatMentionTokens("hello sander"), []);
  });
});
