import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectImageFiles,
  markdownImageSnippet,
} from "./markdown-image-paste.js";

describe("markdownImageSnippet", () => {
  it("builds a markdown image with a default alt", () => {
    assert.equal(
      markdownImageSnippet("/api/v1/tasks/t1/images/i1"),
      "![screenshot](/api/v1/tasks/t1/images/i1)",
    );
  });

  it("strips brackets from alt text", () => {
    assert.equal(
      markdownImageSnippet("/api/v1/tasks/t1/images/i1", "err[or]"),
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
    assert.deepEqual(collectImageFiles(dt), [image]);
  });

  it("returns empty when data is missing", () => {
    assert.deepEqual(collectImageFiles(null), []);
    assert.deepEqual(collectImageFiles(undefined), []);
  });
});
