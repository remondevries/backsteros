import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorState } from "@codemirror/state";

import {
  isCursorInRange,
  isTaskListMarkAfter,
  isUnorderedListMark,
  listMarkReplaceTo,
} from "./document-editor-list-bullets.js";

test("isUnorderedListMark accepts -, *, +", () => {
  assert.equal(isUnorderedListMark("-"), true);
  assert.equal(isUnorderedListMark("*"), true);
  assert.equal(isUnorderedListMark("+"), true);
  assert.equal(isUnorderedListMark("1."), false);
  assert.equal(isUnorderedListMark("- "), false);
});

test("isTaskListMarkAfter detects GFM checkboxes", () => {
  const state = EditorState.create({ doc: "- [ ] todo\n- item" });
  assert.equal(isTaskListMarkAfter(state, 1), true);
  assert.equal(isTaskListMarkAfter(state, 11), false);
});

test("isCursorInRange detects caret on marker", () => {
  const state = EditorState.create({
    doc: "- item",
    selection: { anchor: 0 },
  });
  assert.equal(isCursorInRange(state, 0, 1), true);

  const elsewhere = EditorState.create({
    doc: "- item",
    selection: { anchor: 3 },
  });
  assert.equal(isCursorInRange(elsewhere, 0, 1), false);
});

test("listMarkReplaceTo includes trailing spaces after the marker", () => {
  const state = EditorState.create({ doc: "-  item" });
  assert.equal(listMarkReplaceTo(state, 0, 1), 3);
  const single = EditorState.create({ doc: "- item" });
  assert.equal(listMarkReplaceTo(single, 0, 1), 2);
});
