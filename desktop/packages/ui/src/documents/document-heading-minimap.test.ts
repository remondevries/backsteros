import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compactDocumentHeadingPreview,
  deriveDocumentHeadingMinimapItems,
  documentHeadingMinimapSectionId,
  resolveDocumentHeadingMinimapHasPersistentGutter,
  resolveDocumentHeadingMinimapHeightStyle,
  resolveDocumentHeadingMinimapHitStripWidth,
  resolveDocumentHeadingMinimapIndexFromPointer,
  resolveDocumentHeadingMinimapInteractiveWidth,
  resolveDocumentHeadingMinimapTopPercent,
} from "./document-heading-minimap.js";

describe("document heading minimap helpers", () => {
  it("sizes the rail from item count", () => {
    assert.equal(
      resolveDocumentHeadingMinimapHeightStyle(5),
      "min(32px, calc(100% - 2rem))",
    );
  });

  it("maps pointer Y to tick index", () => {
    assert.equal(resolveDocumentHeadingMinimapTopPercent(2, 5), 50);
    assert.equal(
      resolveDocumentHeadingMinimapIndexFromPointer({
        itemCount: 5,
        railTop: 0,
        railHeight: 100,
        pointerY: 50,
      }),
      2,
    );
  });

  it("resolves gutter and hit strip from main-column width", () => {
    assert.equal(resolveDocumentHeadingMinimapHasPersistentGutter(800), false);
    assert.equal(resolveDocumentHeadingMinimapHasPersistentGutter(960), true);
    assert.equal(resolveDocumentHeadingMinimapHitStripWidth(800), 0);
    assert.equal(resolveDocumentHeadingMinimapHitStripWidth(960), 40);
    assert.equal(
      resolveDocumentHeadingMinimapInteractiveWidth(40, true),
      "16rem",
    );
  });

  it("compacts preview text", () => {
    assert.equal(
      compactDocumentHeadingPreview("  hello\nworld  "),
      "hello world",
    );
    assert.equal(compactDocumentHeadingPreview("   "), null);
  });

  it("assigns stable occurrence ids", () => {
    assert.equal(documentHeadingMinimapSectionId(0), "heading-0");
    assert.equal(documentHeadingMinimapSectionId(3), "heading-3");
  });

  it("derives ATX headings with levels and duplicate titles", () => {
    const items = deriveDocumentHeadingMinimapItems(
      "# Intro\n\n## Details\n\n### Nested\n\n## Details\n\n###### Tiny\n",
    );
    assert.equal(items.length, 5);
    assert.deepEqual(items[0], { id: "heading-0", level: 1, text: "Intro" });
    assert.deepEqual(items[1], { id: "heading-1", level: 2, text: "Details" });
    assert.deepEqual(items[2], { id: "heading-2", level: 3, text: "Nested" });
    assert.deepEqual(items[3], { id: "heading-3", level: 2, text: "Details" });
    assert.deepEqual(items[4], { id: "heading-4", level: 6, text: "Tiny" });
  });

  it("skips headings inside fenced code blocks", () => {
    const items = deriveDocumentHeadingMinimapItems(
      [
        "# Real",
        "",
        "```md",
        "# Fake in fence",
        "## Also fake",
        "```",
        "",
        "## After",
        "",
        "~~~",
        "# Tilde fence",
        "~~~",
        "",
        "### End",
      ].join("\n"),
    );
    assert.equal(items.length, 3);
    assert.equal(items[0]?.text, "Real");
    assert.equal(items[1]?.text, "After");
    assert.equal(items[2]?.text, "End");
  });

  it("skips empty heading text and ignores setext", () => {
    const items = deriveDocumentHeadingMinimapItems(
      ["# ", "##", "Title", "=====", "### Keep"].join("\n"),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]?.text, "Keep");
  });

  it("strips trailing ATX closing hashes", () => {
    const items = deriveDocumentHeadingMinimapItems("## Closed ##\n");
    assert.equal(items[0]?.text, "Closed");
  });
});
