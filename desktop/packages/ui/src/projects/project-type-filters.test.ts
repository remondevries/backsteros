import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterProjectsByType,
  getCatalogListTypeHref,
  getProjectTypeFilterLabel,
  parseProjectTypeFilter,
  parseProjectTypeFilterFromLocation,
  PROJECT_TYPE_FILTER_ALL,
  PROJECT_TYPE_FILTERS,
  projectTypeForCatalogCreate,
} from "./project-type-filters.js";

describe("project-type-filters", () => {
  it("labels All and known types", () => {
    assert.equal(getProjectTypeFilterLabel("all"), "All");
    assert.equal(getProjectTypeFilterLabel("general"), "Default");
    assert.equal(getProjectTypeFilterLabel("codebase"), "Codebase");
  });

  it("filters by type and treats missing type as general", () => {
    const projects = [
      { id: "1", type: "codebase" },
      { id: "2", type: "general" },
      { id: "3", type: null },
      { id: "4", type: "webhosting" },
    ];
    assert.deepEqual(
      filterProjectsByType(projects, "all").map((p) => p.id),
      ["1", "2", "3", "4"],
    );
    assert.deepEqual(
      filterProjectsByType(projects, "general").map((p) => p.id),
      ["2", "3"],
    );
    assert.deepEqual(
      filterProjectsByType(projects, "codebase").map((p) => p.id),
      ["1"],
    );
  });

  it("parses filter values and builds catalog hrefs", () => {
    assert.equal(parseProjectTypeFilter(null), PROJECT_TYPE_FILTER_ALL);
    assert.equal(parseProjectTypeFilter("codebase"), "codebase");
    assert.equal(parseProjectTypeFilter("nope"), PROJECT_TYPE_FILTER_ALL);
    assert.equal(getCatalogListTypeHref(), "/catalog");
    assert.equal(
      getCatalogListTypeHref("webhosting", "board"),
      "/catalog?type=webhosting&view=board",
    );
    assert.equal(
      parseProjectTypeFilterFromLocation("/catalog", "?type=it_service"),
      "it_service",
    );
    assert.equal(
      parseProjectTypeFilterFromLocation("/development", "?type=codebase"),
      "codebase",
    );
    assert.equal(parseProjectTypeFilterFromLocation("/projects"), null);
  });

  it("exposes All plus every project type", () => {
    assert.deepEqual(PROJECT_TYPE_FILTERS, [
      "all",
      "general",
      "codebase",
      "it_service",
      "webhosting",
      "domeinname",
      "email",
    ]);
  });

  it("picks create type from the active filter", () => {
    assert.equal(projectTypeForCatalogCreate("all"), "general");
    assert.equal(projectTypeForCatalogCreate("codebase"), "codebase");
  });
});
