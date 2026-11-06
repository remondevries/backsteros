import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectSearchableDropdownOptionFilters,
  filterSearchableDropdownOptionsByFilter,
  projectTypeDropdownFilter,
  SEARCHABLE_DROPDOWN_FILTER_ALL,
} from "./searchable-dropdown-option-filters.js";

describe("searchable-dropdown-option-filters", () => {
  it("projectTypeDropdownFilter maps legacy types to labels", () => {
    assert.deepEqual(projectTypeDropdownFilter("domeinname"), {
      filterValue: "domeinname",
      filterLabel: "Domains",
    });
    assert.deepEqual(projectTypeDropdownFilter(null), {
      filterValue: "general",
      filterLabel: "Default",
    });
  });

  it("collectSearchableDropdownOptionFilters returns empty under two types", () => {
    assert.deepEqual(
      collectSearchableDropdownOptionFilters([
        { filterValue: "codebase", filterLabel: "Codebase" },
        { filterValue: "codebase", filterLabel: "Codebase" },
        {},
      ]),
      [],
    );
  });

  it("collectSearchableDropdownOptionFilters prepends All and orders types", () => {
    assert.deepEqual(
      collectSearchableDropdownOptionFilters([
        { filterValue: "domeinname", filterLabel: "Domains" },
        { filterValue: "codebase", filterLabel: "Codebase" },
        { filterValue: "email", filterLabel: "E-mail" },
        {},
      ]),
      [
        { value: SEARCHABLE_DROPDOWN_FILTER_ALL, label: "All" },
        { value: "codebase", label: "Codebase" },
        { value: "domeinname", label: "Domains" },
        { value: "email", label: "E-mail" },
      ],
    );
  });

  it("filterSearchableDropdownOptionsByFilter keeps untyped sentinels", () => {
    const options = [
      { value: "__none__", label: "No project" },
      {
        value: "OS",
        label: "OS",
        filterValue: "codebase",
        filterLabel: "Codebase",
      },
      {
        value: "DOM",
        label: "Domain",
        filterValue: "domeinname",
        filterLabel: "Domains",
      },
    ];
    assert.deepEqual(
      filterSearchableDropdownOptionsByFilter(options, "codebase").map(
        (entry) => entry.value,
      ),
      ["__none__", "OS"],
    );
    assert.deepEqual(
      filterSearchableDropdownOptionsByFilter(
        options,
        SEARCHABLE_DROPDOWN_FILTER_ALL,
      ).map((entry) => entry.value),
      ["__none__", "OS", "DOM"],
    );
  });
});
