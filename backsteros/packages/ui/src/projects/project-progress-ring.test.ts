import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeProjectTaskProgress,
  computeProjectTaskProgressRatio,
} from "./project-progress-ring.js";

describe("computeProjectTaskProgress", () => {
  it("counts completed tasks against the total", () => {
    assert.deepEqual(
      computeProjectTaskProgress([
        { status: "completed" },
        { status: "in_progress" },
        { status: "completed" },
        { status: "canceled" },
      ]),
      { total: 4, completed: 2 },
    );
  });

  it("returns zeroes for an empty project", () => {
    assert.deepEqual(computeProjectTaskProgress([]), {
      total: 0,
      completed: 0,
    });
  });
});

describe("computeProjectTaskProgressRatio", () => {
  it("clamps to the 0..1 range and handles empty totals", () => {
    assert.equal(computeProjectTaskProgressRatio(0, 0), 0);
    assert.equal(computeProjectTaskProgressRatio(1, 4), 0.25);
    assert.equal(computeProjectTaskProgressRatio(5, 4), 1);
  });
});
