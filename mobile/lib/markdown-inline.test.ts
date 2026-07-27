import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyMarkdownBlock,
  parseInlineMarkdown,
  parseMarkdownTable,
  splitMarkdownContentParts,
} from "./markdown-inline";

describe("classifyMarkdownBlock", () => {
  it("detects headings", () => {
    assert.deepEqual(classifyMarkdownBlock("## Hello"), {
      kind: "heading",
      level: 2,
      text: "Hello",
    });
  });

  it("detects blockquotes", () => {
    assert.deepEqual(classifyMarkdownBlock("> noted"), {
      kind: "blockquote",
      text: "noted",
    });
  });

  it("detects horizontal rules", () => {
    assert.deepEqual(classifyMarkdownBlock("---"), { kind: "hr" });
  });

  it("detects tables", () => {
    const block = classifyMarkdownBlock(
      "| A | B |\n| --- | ---: |\n| 1 | **2** |",
    );
    assert.equal(block.kind, "table");
    if (block.kind !== "table") return;
    assert.deepEqual(block.table.headers, ["A", "B"]);
    assert.deepEqual(block.table.alignments, [null, "right"]);
    assert.deepEqual(block.table.rows, [["1", "**2**"]]);
  });

  it("falls back to paragraph", () => {
    assert.deepEqual(classifyMarkdownBlock("plain text"), {
      kind: "paragraph",
      text: "plain text",
    });
  });
});

describe("parseMarkdownTable", () => {
  it("returns null without a delimiter row", () => {
    assert.equal(parseMarkdownTable("| A | B |\n| 1 | 2 |"), null);
  });
});

describe("splitMarkdownContentParts", () => {
  it("extracts a table between surrounding text", () => {
    const parts = splitMarkdownContentParts(
      "Before\n| A | B |\n| --- | --- |\n| 1 | 2 |\nAfter",
    );
    assert.equal(parts.length, 3);
    assert.equal(parts[0]?.type, "text");
    assert.equal(parts[1]?.type, "table");
    assert.equal(parts[2]?.type, "text");
    if (parts[1]?.type === "table") {
      assert.deepEqual(parts[1].table.rows, [["1", "2"]]);
    }
  });
});

describe("parseInlineMarkdown", () => {
  it("parses bold and italic", () => {
    assert.deepEqual(parseInlineMarkdown("a **bold** and *ital*"), [
      { type: "text", value: "a " },
      { type: "strong", children: [{ type: "text", value: "bold" }] },
      { type: "text", value: " and " },
      { type: "em", children: [{ type: "text", value: "ital" }] },
    ]);
  });

  it("parses inline code and links", () => {
    assert.deepEqual(parseInlineMarkdown("use `x` and [docs](https://a.test)"), [
      { type: "text", value: "use " },
      { type: "code", value: "x" },
      { type: "text", value: " and " },
      {
        type: "link",
        href: "https://a.test",
        children: [{ type: "text", value: "docs" }],
      },
    ]);
  });

  it("parses strikethrough", () => {
    assert.deepEqual(parseInlineMarkdown("~~old~~"), [
      { type: "del", children: [{ type: "text", value: "old" }] },
    ]);
  });
});
