import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAnsiStripper, stripAnsi } from "./strip-ansi.ts";

describe("stripAnsi", () => {
  it("removes CSI color codes", () => {
    assert.equal(stripAnsi("\u001B[32mready\u001B[39m"), "ready");
  });

  it("removes dim/bold styles used by Astro/Vite logs", () => {
    assert.equal(
      stripAnsi("\u001B[2m23:42:42\u001B[22m \u001B[34m[types]\u001B[39m Generated"),
      "23:42:42 [types] Generated",
    );
  });

  it("handles escapes split across chunks", () => {
    const stripper = createAnsiStripper();
    assert.equal(stripper.push("hello \u001B"), "hello ");
    assert.equal(stripper.push("[32mworld\u001B[39m!"), "world!");
    assert.equal(stripper.flush(), "");
  });
});
