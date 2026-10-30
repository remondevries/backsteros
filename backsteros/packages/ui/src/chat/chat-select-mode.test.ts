import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatSelectModeCountLabel,
  isChatMessageSelectable,
  toggleChatMessageSelection,
} from "./chat-select-mode.js";

describe("chat-select-mode", () => {
  it("toggles ids in and out of the selection set", () => {
    const empty = new Set<string>();
    const withOne = toggleChatMessageSelection(empty, "m1");
    assert.deepEqual([...withOne], ["m1"]);
    const withTwo = toggleChatMessageSelection(withOne, "m2");
    assert.deepEqual([...withTwo].sort(), ["m1", "m2"]);
    const withoutOne = toggleChatMessageSelection(withTwo, "m1");
    assert.deepEqual([...withoutOne], ["m2"]);
  });

  it("does not mutate the previous set", () => {
    const previous = new Set(["a"]);
    const next = toggleChatMessageSelection(previous, "b");
    assert.equal(previous.has("b"), false);
    assert.equal(next.has("a"), true);
    assert.equal(next.has("b"), true);
  });

  it("formats the selection count label", () => {
    assert.equal(chatSelectModeCountLabel(0), "0 selected");
    assert.equal(chatSelectModeCountLabel(1), "1 selected");
    assert.equal(chatSelectModeCountLabel(4), "4 selected");
  });

  it("only treats user/assistant rows as selectable", () => {
    assert.equal(isChatMessageSelectable("user"), true);
    assert.equal(isChatMessageSelectable("assistant"), true);
    assert.equal(isChatMessageSelectable("system"), false);
  });
});
