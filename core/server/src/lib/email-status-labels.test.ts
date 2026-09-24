import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_STATUS_LABEL_NAMES,
  emailStatusLabelName,
  emailStatusLabelPatch,
  migrateLegacyEmailStatus,
} from "./email-status-labels.js";

describe("emailStatusLabelName", () => {
  it("maps statuses to Task-style folder names", () => {
    assert.equal(emailStatusLabelName("triage"), "Triage");
    assert.equal(emailStatusLabelName("ready_to_start"), "Ready to Start");
    assert.equal(emailStatusLabelName("in_progress"), "In Progress");
    assert.equal(emailStatusLabelName("completed"), "Completed");
  });

  it("migrates legacy status values", () => {
    assert.equal(migrateLegacyEmailStatus("todo"), "ready_to_start");
    assert.equal(migrateLegacyEmailStatus("done"), "completed");
    assert.equal(emailStatusLabelName("todo"), "Ready to Start");
  });
});

describe("emailStatusLabelPatch", () => {
  it("adds the target status label and removes every other status label", () => {
    const patch = emailStatusLabelPatch("in_progress");
    assert.deepEqual(patch.addLabels, ["In Progress"]);
    assert.ok(!patch.removeLabels.includes("In Progress"));
    assert.equal(patch.removeLabels.length, EMAIL_STATUS_LABEL_NAMES.length - 1);
    assert.ok(patch.removeLabels.includes("Triage"));
    assert.ok(patch.removeLabels.includes("Ready to Start"));
    assert.ok(patch.removeLabels.includes("Completed"));
  });

  it("covers all known status folder names", () => {
    assert.deepEqual(
      [...EMAIL_STATUS_LABEL_NAMES].sort(),
      [
        "Backlog",
        "Canceled",
        "Completed",
        "Duplicated",
        "In Progress",
        "In Review",
        "On Hold",
        "Ready to Start",
        "Triage",
      ].sort(),
    );
  });
});
