import { describe, expect, it } from "vitest";

import { collectImageFiles, markdownImageSnippet } from "./markdown-image-paste";

describe("markdownImageSnippet", () => {
  it("builds a markdown image with a default alt", () => {
    expect(markdownImageSnippet("/api/v1/tasks/t1/images/i1")).toBe(
      "![screenshot](/api/v1/tasks/t1/images/i1)",
    );
  });

  it("strips brackets from alt text", () => {
    expect(markdownImageSnippet("/api/v1/tasks/t1/images/i1", "err[or]")).toBe(
      "![error](/api/v1/tasks/t1/images/i1)",
    );
  });
});

describe("collectImageFiles", () => {
  it("returns only image/* files", () => {
    const image = new File([new Uint8Array([1])], "a.png", {
      type: "image/png",
    });
    const text = new File(["hi"], "a.txt", { type: "text/plain" });
    const dt = {
      files: [image, text],
    } as unknown as DataTransfer;
    expect(collectImageFiles(dt)).toEqual([image]);
  });

  it("returns empty when data is missing", () => {
    expect(collectImageFiles(null)).toEqual([]);
    expect(collectImageFiles(undefined)).toEqual([]);
  });
});
