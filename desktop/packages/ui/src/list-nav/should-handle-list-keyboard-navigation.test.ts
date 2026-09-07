import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isShiftJkNavigation,
  listKeyboardNavDirection,
} from "./should-handle-list-keyboard-navigation.js";

describe("listKeyboardNavDirection", () => {
  it("treats Shift+J/K (uppercase key) like j/k", () => {
    assert.equal(listKeyboardNavDirection("j"), "down");
    assert.equal(listKeyboardNavDirection("J"), "down");
    assert.equal(listKeyboardNavDirection("k"), "up");
    assert.equal(listKeyboardNavDirection("K"), "up");
  });
});

describe("isShiftJkNavigation", () => {
  it("matches Shift+J/K and Shift+ArrowUp/Down by code", () => {
    assert.equal(
      isShiftJkNavigation({ shiftKey: true, code: "KeyJ" }),
      true,
    );
    assert.equal(
      isShiftJkNavigation({ shiftKey: true, code: "KeyK" }),
      true,
    );
    assert.equal(
      isShiftJkNavigation({ shiftKey: true, code: "ArrowDown" }),
      true,
    );
    assert.equal(
      isShiftJkNavigation({ shiftKey: true, code: "ArrowUp" }),
      true,
    );
    assert.equal(
      isShiftJkNavigation({ shiftKey: false, code: "KeyJ" }),
      false,
    );
    assert.equal(
      isShiftJkNavigation({ shiftKey: false, code: "ArrowDown" }),
      false,
    );
    assert.equal(
      isShiftJkNavigation({ shiftKey: true, code: "ArrowLeft" }),
      false,
    );
  });
});
