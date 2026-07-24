import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAgentCommentReplyPrompt } from "./format-agent-comment-reply-prompt.ts";

describe("formatAgentCommentReplyPrompt", () => {
  it("returns empty when reply is blank", () => {
    assert.equal(
      formatAgentCommentReplyPrompt({
        parentBody: "Agent said something.",
        replyBody: "  ",
      }),
      "",
    );
  });

  it("returns bare reply when parent is blank", () => {
    assert.equal(
      formatAgentCommentReplyPrompt({
        parentBody: "",
        replyBody: "Please continue.",
      }),
      "Please continue.",
    );
  });

  it("includes parent context above the user reply", () => {
    const prompt = formatAgentCommentReplyPrompt({
      parentBody: "Need the branch name.",
      replyBody: "Use main.",
    });
    assert.match(prompt, /Original agent comment:/);
    assert.match(prompt, /Need the branch name\./);
    assert.match(prompt, /User reply:\nUse main\./);
    assert.ok(prompt.indexOf("Need the branch name.") < prompt.indexOf("Use main."));
  });
});
