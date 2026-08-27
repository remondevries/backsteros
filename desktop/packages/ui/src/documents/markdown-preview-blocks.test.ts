import assert from "node:assert/strict";
import { test } from "node:test";

import { hasBlockMarkdown } from "./markdown-preview-blocks.ts";

test("hasBlockMarkdown is false for inline-only prose", () => {
  assert.equal(hasBlockMarkdown("EXPORT SCHEDULE for next year"), false);
  assert.equal(hasBlockMarkdown("Line one\nLine two"), false);
});

test("hasBlockMarkdown detects ordered lists with . and )", () => {
  assert.equal(hasBlockMarkdown("1. First item"), true);
  assert.equal(hasBlockMarkdown("1) First item"), true);
  assert.equal(
    hasBlockMarkdown("EXPORT SCHEDULE\n1. First item\n2. Second"),
    true,
  );
  assert.equal(
    hasBlockMarkdown("EXPORT SCHEDULE\n1) First item"),
    true,
  );
});

test("hasBlockMarkdown detects unordered lists, headings, and quotes", () => {
  assert.equal(hasBlockMarkdown("- item"), true);
  assert.equal(hasBlockMarkdown("## Heading"), true);
  assert.equal(hasBlockMarkdown("> quoted"), true);
});
