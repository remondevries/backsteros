import assert from "node:assert/strict";
import { test } from "node:test";

import { listHangIndentColumns } from "../../dist/documents/document-editor-list-hang-indent.js";

test("listHangIndentColumns measures unordered markers", () => {
  assert.equal(listHangIndentColumns("- item"), 2);
  assert.equal(listHangIndentColumns("* item"), 2);
  assert.equal(listHangIndentColumns("+ item"), 2);
  assert.equal(listHangIndentColumns("  - nested"), 4);
});

test("listHangIndentColumns measures ordered markers", () => {
  assert.equal(listHangIndentColumns("1. item"), 3);
  assert.equal(listHangIndentColumns("12. item"), 4);
  assert.equal(listHangIndentColumns("1) item"), 3);
});

test("listHangIndentColumns measures task checkboxes", () => {
  assert.equal(listHangIndentColumns("- [ ] todo"), 6);
  assert.equal(listHangIndentColumns("- [x] done"), 6);
  assert.equal(listHangIndentColumns("  - [X] nested"), 8);
});

test("listHangIndentColumns ignores non-list lines", () => {
  assert.equal(listHangIndentColumns("plain text"), null);
  assert.equal(listHangIndentColumns("# heading"), null);
  assert.equal(listHangIndentColumns("-nospace"), null);
});
