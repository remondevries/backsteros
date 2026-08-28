import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
