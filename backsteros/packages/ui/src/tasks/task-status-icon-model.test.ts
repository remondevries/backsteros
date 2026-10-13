import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeTaskStatusIconModel } from "./task-status-icon-model.js";

describe("computeTaskStatusIconModel", () => {
  it("uses the backlog glyph only for real backlog status", () => {
    const model = computeTaskStatusIconModel({
      status: "backlog",
      colorScheme: "dark",
    });
    assert.equal(model.kind, "backlog");
  });

  it("does not treat a missing catalog status as backlog", () => {
    for (const status of [null, undefined, "", "missing"]) {
      const model = computeTaskStatusIconModel({
        status,
        colorScheme: "dark",
      });
      assert.equal(model.kind, "unknown");
    }
  });
});
