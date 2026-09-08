import { describe, expect, it } from "vitest";

import {
  splitMarkdownPreviewParagraphs,
  withSoftLineHardBreaks,
} from "./markdown-preview-paragraphs";

describe("splitMarkdownPreviewParagraphs", () => {
  it("keeps a single blank row between paragraphs", () => {
    expect(splitMarkdownPreviewParagraphs("a\n\nb")).toEqual(["a", "", "b"]);
  });

  it("keeps multiple blank rows (same as empty lines in the editor)", () => {
    expect(splitMarkdownPreviewParagraphs("a\n\n\nb")).toEqual(["a", "", "", "b"]);
  });

  it("does not split blank lines inside fenced code", () => {
    const body = "before\n\n```\nline\n\nline\n```\n\nafter";
    expect(splitMarkdownPreviewParagraphs(body)).toEqual([
      "before",
      "",
      "```\nline\n\nline\n```",
      "",
      "after",
    ]);
  });
});

describe("withSoftLineHardBreaks", () => {
  it("turns soft newlines into markdown hard breaks", () => {
    expect(withSoftLineHardBreaks("a\nb")).toBe("a  \nb");
  });
});
