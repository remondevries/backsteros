import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildProjectDropdownOptions,
  DROPDOWN_NO_PROJECT_VALUE,
} from "./dropdown-options.js";

test("buildProjectDropdownOptions hides completed canceled duplicated", () => {
  const options = buildProjectDropdownOptions(
    [
      { key: "OS", name: "Open", status: "active" },
      { key: "DONE", name: "Done", status: "completed" },
      { key: "CXL", name: "Canceled", status: "canceled" },
      { key: "DUP", name: "Dup", status: "duplicated" },
      { key: "HOLD", name: "Hold", status: "on_hold" },
    ],
    { includeNone: false },
  );

  assert.deepEqual(
    options.map((option) => option.value),
    ["OS", "HOLD"],
  );
});

test("buildProjectDropdownOptions includeClosed lists completed and canceled", () => {
  const options = buildProjectDropdownOptions(
    [
      { key: "OS", name: "Open", status: "active" },
      { key: "DONE", name: "Done", status: "completed" },
      { key: "CXL", name: "Canceled", status: "canceled" },
    ],
    { includeNone: false, includeClosed: true },
  );

  assert.deepEqual(
    options.map((option) => option.value),
    ["OS", "DONE", "CXL"],
  );
});

test("buildProjectDropdownOptions keeps a closed assigned project", () => {
  const options = buildProjectDropdownOptions(
    [
      { key: "OS", name: "Open", status: "active" },
      { key: "DONE", name: "Done", status: "completed" },
    ],
    { includeNone: true, keepKeys: ["DONE"] },
  );

  assert.equal(options[0]?.value, DROPDOWN_NO_PROJECT_VALUE);
  assert.deepEqual(
    options.slice(1).map((option) => option.value),
    ["OS", "DONE"],
  );
});
