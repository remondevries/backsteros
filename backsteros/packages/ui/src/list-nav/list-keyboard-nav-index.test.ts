import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveListKeyboardActivationAnchor,
  resolveListKeyboardStepTarget,
  stepListKeyboardIndex,
} from "./list-keyboard-nav-index.js";

describe("stepListKeyboardIndex", () => {
  it("lands on the end when there is no current index", () => {
    assert.equal(stepListKeyboardIndex(-1, "down", 3), 0);
    assert.equal(stepListKeyboardIndex(-1, "up", 3), 2);
  });
});

describe("resolveListKeyboardStepTarget", () => {
  const items = ["a", "b", "c"];

  it("first j with no highlight lands on the selected row", () => {
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "down",
        highlightedId: null,
        selectedId: "a",
        itemIds: items,
      }),
      "a",
    );
  });

  it("first j with no selection lands on the first row", () => {
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "down",
        highlightedId: null,
        selectedId: null,
        itemIds: items,
      }),
      "a",
    );
  });

  it("first k with no highlight lands on the selected row", () => {
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "up",
        highlightedId: null,
        selectedId: "b",
        itemIds: items,
      }),
      "b",
    );
  });

  it("steps from an existing keyboard highlight", () => {
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "down",
        highlightedId: "a",
        selectedId: "a",
        itemIds: items,
      }),
      "b",
    );
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "up",
        highlightedId: "b",
        selectedId: "a",
        itemIds: items,
      }),
      "a",
    );
  });

  it("first j/k with hover pickup steps from the hovered row", () => {
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "down",
        highlightedId: null,
        selectedId: "a",
        itemIds: items,
        hoverAnchorId: "b",
      }),
      "c",
    );
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "up",
        highlightedId: null,
        selectedId: "a",
        itemIds: items,
        hoverAnchorId: "b",
      }),
      "a",
    );
  });

  it("keyboard highlight wins over hover pickup", () => {
    assert.equal(
      resolveListKeyboardStepTarget({
        direction: "down",
        highlightedId: "a",
        selectedId: "a",
        itemIds: items,
        hoverAnchorId: "b",
      }),
      "b",
    );
  });
});

describe("resolveListKeyboardActivationAnchor", () => {
  const items = ["top", "today", "later"];

  it("prefers an explicit landing id", () => {
    assert.equal(
      resolveListKeyboardActivationAnchor({
        preferredItemId: "later",
        selectedId: "today",
        highlightedId: "today",
        itemIds: items,
      }),
      "later",
    );
  });

  it("prefers the selected row over an existing highlight", () => {
    assert.equal(
      resolveListKeyboardActivationAnchor({
        preferredItemId: null,
        selectedId: "today",
        highlightedId: "top",
        itemIds: items,
      }),
      "today",
    );
  });

  it("keeps an existing highlight when nothing is selected (Tab into list)", () => {
    assert.equal(
      resolveListKeyboardActivationAnchor({
        preferredItemId: null,
        selectedId: null,
        highlightedId: "today",
        itemIds: items,
      }),
      "today",
    );
  });

  it("falls back to the first row only when nothing else applies", () => {
    assert.equal(
      resolveListKeyboardActivationAnchor({
        preferredItemId: null,
        selectedId: null,
        highlightedId: null,
        itemIds: items,
      }),
      "top",
    );
  });
});
