import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findMarkdownTaskListCheckboxes,
  normalizeMarkdownTaskLists,
  parseMarkdownTaskCheckbox,
  toggleMarkdownTaskListItem,
} from "../dist/markdown-task-list.js";

describe("normalizeMarkdownTaskLists", () => {
  it("expands empty brackets to an unchecked GFM marker", () => {
    assert.equal(
      normalizeMarkdownTaskLists("- [] buy milk\n* [] eggs\n+ [] bread"),
      "- [ ] buy milk\n* [ ] eggs\n+ [ ] bread",
    );
  });

  it("leaves standard markers alone", () => {
    const source = "- [ ] open\n- [x] done\n- [X] also";
    assert.equal(normalizeMarkdownTaskLists(source), source);
  });

  it("does not rewrite markers inside inline code", () => {
    const source = "Use `- []` or `- [ ]` for unchecked.";
    assert.equal(normalizeMarkdownTaskLists(source), source);
  });

  it("does not rewrite markers inside fenced code blocks", () => {
    const source = "```md\n- [] example\n- [x] done\n```\n\n- [] real";
    assert.equal(
      normalizeMarkdownTaskLists(source),
      "```md\n- [] example\n- [x] done\n```\n\n- [ ] real",
    );
  });
});

describe("parseMarkdownTaskCheckbox", () => {
  it("parses unchecked variants", () => {
    assert.deepEqual(parseMarkdownTaskCheckbox("[ ] buy milk"), {
      checked: false,
      textAfter: "buy milk",
    });
    assert.deepEqual(parseMarkdownTaskCheckbox("[] buy milk"), {
      checked: false,
      textAfter: "buy milk",
    });
    assert.deepEqual(parseMarkdownTaskCheckbox("[ ]"), {
      checked: false,
      textAfter: "",
    });
  });

  it("parses checked variants", () => {
    assert.deepEqual(parseMarkdownTaskCheckbox("[x] ship it"), {
      checked: true,
      textAfter: "ship it",
    });
    assert.deepEqual(parseMarkdownTaskCheckbox("[X] ship it"), {
      checked: true,
      textAfter: "ship it",
    });
  });

  it("ignores backtick-wrapped markers so docs stay literal", () => {
    assert.equal(parseMarkdownTaskCheckbox("`[ ]` for unchecked"), null);
    assert.equal(parseMarkdownTaskCheckbox("`[x]` for checked"), null);
    assert.equal(parseMarkdownTaskCheckbox("`[]` typo form"), null);
  });

  it("returns null for ordinary list text", () => {
    assert.equal(parseMarkdownTaskCheckbox("plain item"), null);
    assert.equal(parseMarkdownTaskCheckbox("[link](url)"), null);
  });
});

describe("toggleMarkdownTaskListItem", () => {
  it("toggles unchecked to checked and updates the source", () => {
    const source = "- [ ] one\n- [ ] two\n- [x] three";
    assert.equal(
      toggleMarkdownTaskListItem(source, 1),
      "- [ ] one\n- [x] two\n- [x] three",
    );
    assert.equal(
      toggleMarkdownTaskListItem(source, 2),
      "- [ ] one\n- [ ] two\n- [ ] three",
    );
  });

  it("expands empty brackets when checking", () => {
    assert.equal(toggleMarkdownTaskListItem("- [] item", 0), "- [x] item");
  });

  it("ignores checkboxes inside inline code and fences", () => {
    const source =
      "Use `- [ ]` in docs.\n\n```md\n- [ ] example\n```\n\n- [ ] real";
    const matches = findMarkdownTaskListCheckboxes(source);
    assert.equal(matches.length, 1);
    assert.equal(
      toggleMarkdownTaskListItem(source, 0),
      "Use `- [ ]` in docs.\n\n```md\n- [ ] example\n```\n\n- [x] real",
    );
  });

  it("returns null for out-of-range indexes", () => {
    assert.equal(toggleMarkdownTaskListItem("- [ ] only", 3), null);
  });
});
