import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computePlainTextMentionTrigger,
  insertMentionTokenAtTrigger,
  segmentComposerMentionText,
} from "./chat-composer-mentions.js";

describe("computePlainTextMentionTrigger", () => {
  it("opens after @ at the start of the line", () => {
    const trigger = computePlainTextMentionTrigger("@os", 3);
    assert.deepEqual(trigger, { from: 0, to: 3, query: "os" });
  });

  it("opens after whitespace mid-line", () => {
    const text = "Hi [@contact:remon] see @OS";
    const trigger = computePlainTextMentionTrigger(text, text.length);
    assert.ok(trigger);
    assert.equal(trigger!.query, "OS");
    assert.equal(text.slice(trigger!.from, trigger!.to), "@OS");
  });

  it("returns null when not in a mention query", () => {
    assert.equal(computePlainTextMentionTrigger("hello world", 5), null);
  });

  it("scopes to the current line", () => {
    const text = "@old\n@new";
    const trigger = computePlainTextMentionTrigger(text, text.length);
    assert.ok(trigger);
    assert.equal(trigger!.query, "new");
    assert.equal(text.slice(trigger!.from, trigger!.to), "@new");
  });
});

describe("insertMentionTokenAtTrigger", () => {
  it("replaces @query with the token and a trailing space", () => {
    const text = "See @OS";
    const trigger = computePlainTextMentionTrigger(text, text.length);
    assert.ok(trigger);
    const result = insertMentionTokenAtTrigger(
      text,
      trigger!,
      "[@task:OS-144]",
    );
    assert.equal(result.text, "See [@task:OS-144] ");
    assert.equal(result.cursor, "See [@task:OS-144] ".length);
  });
});

describe("segmentComposerMentionText", () => {
  it("splits text and mention tokens for the chip mirror", () => {
    const segments = segmentComposerMentionText(
      "Hi [@contact:remon] and [@task:OS-12].",
    );
    assert.deepEqual(
      segments.map((segment) =>
        segment.type === "mention" ? segment.raw : segment.text,
      ),
      ["Hi ", "[@contact:remon]", " and ", "[@task:OS-12]", "."],
    );
  });
});
