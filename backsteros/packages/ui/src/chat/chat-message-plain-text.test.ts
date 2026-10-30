import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chatMessagePlainText } from "./chat-message-plain-text.js";

describe("chatMessagePlainText", () => {
  it("joins text parts", () => {
    assert.equal(
      chatMessagePlainText({
        id: "1",
        role: "user",
        status: "done",
        parts: [
          { type: "text", text: "Hello" },
          { type: "text", text: "World" },
        ],
      }),
      "Hello\n\nWorld",
    );
  });

  it("skips empty parts", () => {
    assert.equal(
      chatMessagePlainText({
        id: "2",
        role: "assistant",
        status: "done",
        parts: [
          { type: "text", text: "  " },
          { type: "text", text: "Kept" },
        ],
      }),
      "Kept",
    );
  });
});
