import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { segmentMarkdownWithMentions } from "../mention-tokens.js";
import {
  listItemLeadingNewlinesContinueList,
  matchListItemOpener,
  resolveMentionLayout,
} from "./mention-layout.js";

function layoutFor(markdown: string) {
  const segments = segmentMarkdownWithMentions(markdown);
  const index = segments.findIndex((segment) => segment.type === "mention");
  assert.ok(index >= 0, `expected a mention in ${JSON.stringify(markdown)}`);
  return resolveMentionLayout(segments, index);
}

describe("resolveMentionLayout", () => {
  it("uses block when a task/project/letter is alone on a bare line", () => {
    assert.equal(layoutFor("[@task:IN-1]"), "block");
    assert.equal(layoutFor("[@project:alpha]"), "block");
    assert.equal(layoutFor("[@letter:L-1]"), "block");
    assert.equal(layoutFor("Hello\n[@task:IN-1]\nWorld"), "block");
  });

  it("keeps list/heading/quote mentions inline next to the marker", () => {
    assert.equal(layoutFor("- [@task:IN-1]"), "inline");
    assert.equal(layoutFor("* [@task:IN-1]"), "inline");
    assert.equal(layoutFor("1. [@task:IN-1]"), "inline");
    assert.equal(layoutFor("> [@task:IN-1]"), "inline");
    assert.equal(layoutFor("# [@task:IN-1]"), "inline");
    assert.equal(layoutFor("## [@project:alpha]"), "inline");
    assert.equal(layoutFor("Intro\n- [@task:IN-1]"), "inline");
  });

  it("uses inline when the mention is part of a sentence", () => {
    assert.equal(layoutFor("See [@task:IN-1] today"), "inline");
    assert.equal(layoutFor("Hello [@task:IN-1]\n"), "inline");
    assert.equal(layoutFor("note [@letter:L-1] end"), "inline");
    assert.equal(layoutFor("- Check [@task:IN-1] later"), "inline");
    assert.equal(layoutFor("> See [@task:IN-1] please"), "inline");
    assert.equal(layoutFor("# Title with [@task:IN-1]"), "inline");
  });

  it("keeps contact/document/organization mentions inline", () => {
    assert.equal(layoutFor("[@contact:jane]"), "inline");
    assert.equal(layoutFor("[@organization:acme]"), "inline");
    assert.equal(layoutFor("[@document:proj/readme]"), "inline");
    assert.equal(layoutFor("- [@contact:jane]"), "inline");
  });
});

describe("matchListItemOpener / listItemLeadingNewlinesContinueList", () => {
  it("treats a single leading newline as the same list (no blank row)", () => {
    const opener = matchListItemOpener("\n- 2/10 ");
    assert.ok(opener);
    assert.equal(opener.leadingNewlines, "\n");
    assert.equal(listItemLeadingNewlinesContinueList(opener.leadingNewlines), true);
  });

  it("treats two+ leading newlines as a blank row that ends the list", () => {
    const opener = matchListItemOpener("\n\n- next ");
    assert.ok(opener);
    assert.equal(opener.leadingNewlines, "\n\n");
    assert.equal(
      listItemLeadingNewlinesContinueList(opener.leadingNewlines),
      false,
    );
  });
});
