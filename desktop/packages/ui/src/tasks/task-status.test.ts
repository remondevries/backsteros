import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getOptionalTaskStatusLabel,
  getTaskStatusLabel,
} from "./task-status.js";

describe("getOptionalTaskStatusLabel", () => {
  it("returns readable labels for known statuses", () => {
    assert.equal(getOptionalTaskStatusLabel("completed"), "Completed");
    assert.equal(
      getOptionalTaskStatusLabel("ready_to_start"),
      getTaskStatusLabel("ready_to_start"),
    );
  });

  it("returns null when a task is missing from the catalog", () => {
    assert.equal(getOptionalTaskStatusLabel(null), null);
    assert.equal(getOptionalTaskStatusLabel(undefined), null);
    assert.equal(getOptionalTaskStatusLabel(""), null);
    assert.equal(getOptionalTaskStatusLabel("not-a-status"), null);
  });
});
