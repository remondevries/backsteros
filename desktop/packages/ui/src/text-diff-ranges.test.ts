import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSpellcheckSegments,
  composeSpellcheckText,
  diffHighlightRanges,
  toggleSpellcheckSegment,
} from "./text-diff-ranges.js";

describe("diffHighlightRanges", () => {
  it("returns empty when unchanged", () => {
    assert.deepEqual(diffHighlightRanges("Hello", "Hello"), []);
  });

  it("highlights a replaced word", () => {
    const ranges = diffHighlightRanges("Fix teh typo", "Fix the typo");
    assert.equal(ranges.length, 1);
    assert.equal("Fix the typo".slice(ranges[0]!.start, ranges[0]!.end), "the");
  });
});

describe("spellcheck segments", () => {
  it("composes after text when all active", () => {
    const segments = buildSpellcheckSegments("Fix teh typo", "Fix the typo");
    assert.equal(composeSpellcheckText(segments), "Fix the typo");
  });

  it("toggles a change back to before", () => {
    const segments = buildSpellcheckSegments("Fix teh typo", "Fix the typo");
    const change = segments.find((s) => s.kind === "change");
    assert.ok(change);
    const toggled = toggleSpellcheckSegment(segments, change!.id);
    assert.equal(composeSpellcheckText(toggled), "Fix teh typo");
  });

  it("toggles insert off and on", () => {
    const segments = buildSpellcheckSegments(
      "Hello world",
      "Hello beautiful world",
    );
    const change = segments.find((s) => s.kind === "change");
    assert.ok(change);
    const off = toggleSpellcheckSegment(segments, change!.id);
    assert.equal(composeSpellcheckText(off), "Hello world");
    const on = toggleSpellcheckSegment(off, change!.id);
    assert.equal(composeSpellcheckText(on), "Hello beautiful world");
  });
});
