import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterProjectsByArea,
  getProjectAreaFilterLabel,
  getProjectsListAreaHref,
  parseProjectAreaFilter,
  PROJECT_AREA_FILTER_DEFAULT,
  PROJECT_AREA_FILTER_OTHER,
  PROJECT_AREA_FILTERS,
} from "./project-areas.js";

describe("project area filters", () => {
  it("lists defined areas then Other (no All)", () => {
    assert.deepEqual(PROJECT_AREA_FILTERS, [
      "personal",
      "business",
      "clients",
      "other",
    ]);
    assert.equal(getProjectAreaFilterLabel("other"), "Other");
    assert.equal(PROJECT_AREA_FILTER_DEFAULT, "personal");
  });

  it("Other only includes projects without a defined area", () => {
    const projects = [
      { id: "1", area: "personal" as const },
      { id: "2", area: null },
      { id: "3", area: "clients" as const },
    ];
    assert.deepEqual(
      filterProjectsByArea(projects, PROJECT_AREA_FILTER_OTHER).map((p) => p.id),
      ["2"],
    );
    assert.deepEqual(
      filterProjectsByArea(projects, "personal").map((p) => p.id),
      ["1"],
    );
  });

  it("maps legacy all to Other and defaults bare URLs to Personal", () => {
    assert.equal(parseProjectAreaFilter("all"), "other");
    assert.equal(parseProjectAreaFilter(null), "personal");
    assert.equal(getProjectsListAreaHref("personal"), "/projects");
    assert.equal(getProjectsListAreaHref("other"), "/projects?area=other");
  });
});
