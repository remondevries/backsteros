/**
 * Unit tests for composer mention tokenization and trigger detection.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectComposerTrigger,
  replaceTextRange,
} from "./composer-logic.ts";
import {
  serializeComposerFileLink,
  splitPromptIntoComposerSegments,
} from "./composer-mentions.ts";

test("serializeComposerFileLink uses basename as label", () => {
  assert.equal(
    serializeComposerFileLink("src/components/foo.tsx"),
    "[foo.tsx](src/components/foo.tsx)",
  );
});

test("splitPromptIntoComposerSegments parses file links", () => {
  const prompt = "Look at [foo.tsx](src/foo.tsx) please";
  const segments = splitPromptIntoComposerSegments(prompt);
  assert.deepEqual(segments, [
    { type: "text", text: "Look at " },
    {
      type: "mention",
      path: "src/foo.tsx",
      source: "[foo.tsx](src/foo.tsx)",
    },
    { type: "text", text: " please" },
  ]);
});

test("splitPromptIntoComposerSegments parses bare @paths", () => {
  const prompt = "Open @readme.md next";
  const segments = splitPromptIntoComposerSegments(prompt);
  assert.equal(segments[1]?.type, "mention");
  if (segments[1]?.type === "mention") {
    assert.equal(segments[1].path, "readme.md");
  }
});

test("splitPromptIntoComposerSegments ignores scoped package-like @paths", () => {
  const prompt = "Use @scope/package please";
  const segments = splitPromptIntoComposerSegments(prompt);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.type, "text");
});

test("detectComposerTrigger finds @path query", () => {
  const text = "see @src/fo";
  const trigger = detectComposerTrigger(text, text.length);
  assert.deepEqual(trigger, {
    kind: "path",
    query: "src/fo",
    rangeStart: 4,
    rangeEnd: text.length,
  });
});

test("detectComposerTrigger finds slash-command", () => {
  const text = "/mod";
  const trigger = detectComposerTrigger(text, text.length);
  assert.deepEqual(trigger, {
    kind: "slash-command",
    query: "mod",
    rangeStart: 0,
    rangeEnd: text.length,
  });
});

test("detectComposerTrigger finds slash-model", () => {
  const text = "/model gpt";
  const trigger = detectComposerTrigger(text, text.length);
  assert.deepEqual(trigger, {
    kind: "slash-model",
    query: "gpt",
    rangeStart: 0,
    rangeEnd: text.length,
  });
});

test("replaceTextRange inserts replacement at range", () => {
  const result = replaceTextRange("see @src", 4, 8, "[a.ts](a.ts) ");
  assert.equal(result.text, "see [a.ts](a.ts) ");
  assert.equal(result.cursor, "see [a.ts](a.ts) ".length);
});
