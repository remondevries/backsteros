import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors the dirty short-circuit in useMarkdownDetailEditor.saveValue. */
export function shouldSkipMarkdownDetailSave(
  nextNormalized: string,
  lastCleanValue: string,
): boolean {
  return nextNormalized === lastCleanValue;
}

/**
 * Mention rewrite of a clean draft stays clean (no PATCH / no contentVersion bump).
 */
export function afterMentionRewriteBaseline(input: {
  before: string;
  rewritten: string;
  lastClean: string;
}): { value: string; lastClean: string; shouldSave: boolean } {
  if (input.rewritten === input.before) {
    return {
      value: input.before,
      lastClean: input.lastClean,
      shouldSave: false,
    };
  }
  const wasClean = input.before === input.lastClean;
  return {
    value: input.rewritten,
    lastClean: wasClean ? input.rewritten : input.lastClean,
    shouldSave: false,
  };
}

describe("markdown detail no-op save", () => {
  it("skips blur save when value equals last clean body", () => {
    assert.equal(shouldSkipMarkdownDetailSave("hello", "hello"), true);
    assert.equal(shouldSkipMarkdownDetailSave("hello!", "hello"), false);
  });

  it("mention rewrite does not mark dirty or schedule save", () => {
    const result = afterMentionRewriteBaseline({
      before: "See [@contact:abc]",
      rewritten: "See [@contact:C-1]",
      lastClean: "See [@contact:abc]",
    });
    assert.equal(result.shouldSave, false);
    assert.equal(result.value, "See [@contact:C-1]");
    assert.equal(result.lastClean, "See [@contact:C-1]");
  });

  it("mention rewrite on a dirty draft keeps the prior clean baseline", () => {
    const result = afterMentionRewriteBaseline({
      before: "draft [@contact:abc]",
      rewritten: "draft [@contact:C-1]",
      lastClean: "saved",
    });
    assert.equal(result.shouldSave, false);
    assert.equal(result.lastClean, "saved");
  });
});
