import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getActiveProjectSection,
  getProjectSectionHref,
  isProjectSectionId,
  parseProjectSectionId,
  PROJECT_SECTION_IDS,
  PROJECT_SECTIONS,
} from "./project-sections.js";

test("PROJECT_SECTIONS includes Timetracking after Updates", () => {
  assert.ok(PROJECT_SECTION_IDS.includes("timetracking"));
  assert.equal(
    PROJECT_SECTIONS.find((entry) => entry.id === "timetracking")?.label,
    "Timetracking",
  );
  assert.equal(PROJECT_SECTIONS.at(-1)?.id, "timetracking");
  assert.equal(
    PROJECT_SECTIONS.findIndex((entry) => entry.id === "updates"),
    PROJECT_SECTIONS.findIndex((entry) => entry.id === "timetracking") - 1,
  );
});

test("parseProjectSectionId accepts timetracking", () => {
  assert.equal(parseProjectSectionId("timetracking"), "timetracking");
  assert.equal(isProjectSectionId("timetracking"), true);
});

test("getProjectSectionHref and getActiveProjectSection for timetracking", () => {
  assert.equal(
    getProjectSectionHref("OS", "timetracking"),
    "/projects/OS/timetracking",
  );
  assert.equal(
    getActiveProjectSection("/projects/OS/timetracking", "OS"),
    "timetracking",
  );
});
