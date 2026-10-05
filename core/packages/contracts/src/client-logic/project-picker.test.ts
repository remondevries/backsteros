import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterProjectsForDefaultPicker,
  isProjectPickerDefaultVisibleStatus,
} from "./project-picker.js";

test("isProjectPickerDefaultVisibleStatus hides terminal statuses", () => {
  assert.equal(isProjectPickerDefaultVisibleStatus("active"), true);
  assert.equal(isProjectPickerDefaultVisibleStatus("backlog"), true);
  assert.equal(isProjectPickerDefaultVisibleStatus("in_progress"), true);
  assert.equal(isProjectPickerDefaultVisibleStatus("on_hold"), true);
  assert.equal(isProjectPickerDefaultVisibleStatus("completed"), false);
  assert.equal(isProjectPickerDefaultVisibleStatus("canceled"), false);
  assert.equal(isProjectPickerDefaultVisibleStatus("duplicated"), false);
  assert.equal(isProjectPickerDefaultVisibleStatus(null), true);
  assert.equal(isProjectPickerDefaultVisibleStatus(""), true);
});

test("filterProjectsForDefaultPicker drops terminal rows unless kept", () => {
  const projects = [
    { id: "1", key: "OS", status: "active" },
    { id: "2", key: "OLD", status: "completed" },
    { id: "3", key: "DUP", status: "duplicated" },
    { id: "4", key: "CXL", status: "canceled" },
    { id: "5", key: "HOLD", status: "on_hold" },
  ];

  assert.deepEqual(
    filterProjectsForDefaultPicker(projects).map((row) => row.key),
    ["OS", "HOLD"],
  );

  assert.deepEqual(
    filterProjectsForDefaultPicker(projects, {
      keepKeys: ["OLD"],
      keepIds: ["4"],
    }).map((row) => row.key),
    ["OS", "OLD", "CXL", "HOLD"],
  );
});
