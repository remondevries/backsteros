import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractSpellcheckJson,
  SpellcheckError,
  buildSpellcheckPrompt,
  buildResearchPrompt,
  DEFAULT_SPELLCHECK_INSTRUCTIONS,
  DEFAULT_RESEARCH_INSTRUCTIONS,
} from "../lib/spellcheck-parse.js";

describe("extractSpellcheckJson", () => {
  it("parses raw JSON", () => {
    const result = extractSpellcheckJson(
      '{"title":"Hello","description":"World"}',
    );
    assert.equal(result.title, "Hello");
    assert.equal(result.description, "World");
  });

  it("parses fenced JSON", () => {
    const result = extractSpellcheckJson(
      'Here you go:\n```json\n{"title":"A","description":"B"}\n```\n',
    );
    assert.equal(result.title, "A");
    assert.equal(result.description, "B");
  });

  it("rejects missing JSON", () => {
    assert.throws(
      () => extractSpellcheckJson("no json here"),
      (err: unknown) =>
        err instanceof SpellcheckError && err.code === "bad_response",
    );
  });
});

describe("buildSpellcheckPrompt", () => {
  it("uses default instructions and appends title/description", () => {
    const prompt = buildSpellcheckPrompt("T", "D");
    assert.ok(prompt.startsWith(DEFAULT_SPELLCHECK_INSTRUCTIONS));
    assert.ok(prompt.includes("Title:\nT"));
    assert.ok(prompt.includes("Description:\nD"));
  });

  it("uses custom instructions when provided", () => {
    const prompt = buildSpellcheckPrompt("T", "D", "Be brief.");
    assert.ok(prompt.startsWith("Be brief."));
    assert.ok(!prompt.includes("careful copy editor"));
  });
});

describe("buildResearchPrompt", () => {
  it("uses default research instructions", () => {
    const prompt = buildResearchPrompt("T", "D");
    assert.ok(prompt.startsWith(DEFAULT_RESEARCH_INSTRUCTIONS));
    assert.ok(prompt.includes("Title:\nT"));
  });
});
