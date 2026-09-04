import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findGoItemByLetter,
  keyEventToLetter,
} from "./go-navigation.ts";

describe("keyEventToLetter", () => {
  it("maps KeyboardEvent.code-style keys", () => {
    assert.equal(keyEventToLetter("KeyP"), "p");
    assert.equal(keyEventToLetter("KeyG"), "g");
  });

  it("prefers character when present", () => {
    assert.equal(keyEventToLetter("KeyP", "P"), "p");
  });

  it("returns null for non-letters", () => {
    assert.equal(keyEventToLetter("Enter"), null);
    assert.equal(keyEventToLetter("Digit1"), null);
  });
});

describe("findGoItemByLetter", () => {
  it("resolves desktop-parity letters", () => {
    assert.equal(findGoItemByLetter("p")?.href, "/projects");
    assert.equal(findGoItemByLetter("d")?.href, "/development");
    assert.equal(findGoItemByLetter("a")?.href, "/areas");
    assert.equal(findGoItemByLetter("e")?.href, "/email");
    assert.equal(findGoItemByLetter("i")?.href, "/inbox");
    assert.equal(findGoItemByLetter("k")?.href, "/knowledge");
    assert.equal(findGoItemByLetter("l")?.href, "/letters");
  });
});
