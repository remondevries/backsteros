import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Project } from "@backsteros/contracts";

import {
  mapRestProjectRow,
  mapSyncedProjectRow,
  matchesProjectTypeFilter,
} from "./project-list-screen-helpers.ts";

describe("project-list-screen-helpers", () => {
  it("filters codebase projects", () => {
    assert.equal(matchesProjectTypeFilter("codebase", "exclude-codebase"), false);
    assert.equal(matchesProjectTypeFilter("codebase", "codebase-only"), true);
    assert.equal(matchesProjectTypeFilter("general", "all"), true);
  });

  it("maps synced rows with area", () => {
    const row = mapSyncedProjectRow(
      {
        id: "p1",
        key: "BSH",
        name: "BacksterOS",
        status: "active",
        type: "general",
        icon: null,
        priority: 0,
        start_date: null,
        due_date: null,
        area: "personal",
        area_id: null,
        sort_order: 1,
      },
      "all",
    );
    assert.equal(row?.area, "personal");
  });

  it("maps REST projects", () => {
    const row = mapRestProjectRow(
      {
        id: "p2",
        key: "DEV",
        name: "Dev",
        status: "active",
        type: "codebase",
        icon: null,
        priority: 0,
        startDate: null,
        dueDate: null,
        area: "business",
        areaId: null,
        sortOrder: 2,
      } as Project,
      "codebase-only",
    );
    assert.equal(row?.type, "codebase");
  });
});
