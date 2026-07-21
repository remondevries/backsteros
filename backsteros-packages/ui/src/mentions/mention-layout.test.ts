import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { segmentMarkdownWithMentions } from "../mention-tokens.js";
import { resolveMentionLayout } from "./mention-layout.js";

function layoutFor(markdown: string) {
  const segments = segmentMarkdownWithMentions(markdown);
  const index = segments.findIndex((segment) => segment.type === "mention");
  assert.ok(index >= 0, `expected a mention in ${JSON.stringify(markdown)}`);
  return resolveMentionLayout(segments, index);
}

describe("resolveMentionLayout", () => {
  it("uses block when a task/project/letter is alone on its line", () => {
    assert.equal(layoutFor("[@task:IN-1]"), "block");
    assert.equal(layoutFor("[@project:alpha]"), "block");
    assert.equal(layoutFor("[@letter:L-1]"), "block");
    assert.equal(layoutFor("Hello\n[@task:IN-1]\nWorld"), "block");
  });

  it("uses inline when the mention is part of a sentence", () => {
    assert.equal(layoutFor("See [@task:IN-1] today"), "inline");
    assert.equal(layoutFor("Hello [@task:IN-1]\n"), "inline");
    assert.equal(layoutFor("note [@letter:L-1] end"), "inline");
  });

  it("keeps contact/document/organization mentions inline", () => {
    assert.equal(layoutFor("[@contact:jane]"), "inline");
    assert.equal(layoutFor("[@organization:acme]"), "inline");
    assert.equal(layoutFor("[@document:proj/readme]"), "inline");
  });
});
