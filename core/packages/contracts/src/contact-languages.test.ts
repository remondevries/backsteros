import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  coerceContactLanguage,
  coerceContactLanguages,
  contactLanguageLabel,
} from "./contact-languages.js";

describe("contact languages", () => {
  it("coerces known codes case-insensitively", () => {
    assert.equal(coerceContactLanguage("NL"), "nl");
    assert.equal(coerceContactLanguage("en"), "en");
    assert.equal(coerceContactLanguage("xx"), null);
  });

  it("dedupes and drops unknowns from arrays", () => {
    assert.deepEqual(
      coerceContactLanguages(["en", "NL", "xx", "en", { code: "de" }]),
      ["en", "nl", "de"],
    );
  });

  it("parses PowerSync / SQLite JSON text columns", () => {
    assert.deepEqual(coerceContactLanguages('["nl","en"]'), ["nl", "en"]);
    assert.deepEqual(coerceContactLanguages("[]"), []);
    assert.deepEqual(coerceContactLanguages(""), []);
    assert.deepEqual(coerceContactLanguages("not-json"), []);
  });

  it("maps codes to display labels", () => {
    assert.equal(contactLanguageLabel("nl"), "Dutch");
    assert.equal(contactLanguageLabel("fr"), "French");
    assert.equal(contactLanguageLabel("pl"), "Polish");
  });
});
