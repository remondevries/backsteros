import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findSectionListLocation,
  isListKeyboardActivateKey,
  listKeyboardNavDirection,
  stepListKeyboardIndex,
} from "./list-keyboard-nav.ts";

describe("list-keyboard-nav", () => {
  it("steps j/k indices with wrap-from-empty", () => {
    assert.equal(stepListKeyboardIndex(-1, "down", 3), 0);
    assert.equal(stepListKeyboardIndex(0, "down", 3), 1);
    assert.equal(stepListKeyboardIndex(2, "down", 3), 2);
    assert.equal(stepListKeyboardIndex(-1, "up", 3), 2);
    assert.equal(stepListKeyboardIndex(1, "up", 3), 0);
    assert.equal(stepListKeyboardIndex(0, "up", 3), 0);
    assert.equal(stepListKeyboardIndex(-1, "down", 0), -1);
  });

  it("maps keys to direction", () => {
    assert.equal(listKeyboardNavDirection("j"), "down");
    assert.equal(listKeyboardNavDirection("KeyJ"), "down");
    assert.equal(listKeyboardNavDirection("ArrowDown"), "down");
    assert.equal(listKeyboardNavDirection("k"), "up");
    assert.equal(listKeyboardNavDirection("ArrowUp"), "up");
    assert.equal(listKeyboardNavDirection("KeyK", "k"), "up");
    assert.equal(listKeyboardNavDirection("g"), null);
  });

  it("detects activate keys", () => {
    assert.equal(isListKeyboardActivateKey("Enter"), true);
    assert.equal(isListKeyboardActivateKey(" "), true);
    assert.equal(isListKeyboardActivateKey("j"), false);
  });

  it("finds section list locations", () => {
    const sections = [
      { data: [{ id: "a" }, { id: "b" }] },
      { data: [{ id: "c" }] },
    ];
    assert.deepEqual(findSectionListLocation(sections, "b"), {
      sectionIndex: 0,
      itemIndex: 1,
    });
    assert.deepEqual(findSectionListLocation(sections, "c"), {
      sectionIndex: 1,
      itemIndex: 0,
    });
    assert.equal(findSectionListLocation(sections, "z"), null);
  });
});
