import assert from "node:assert/strict";
import { test } from "node:test";

import { groupProjectsByNestedArea } from "../../dist/projects/group-projects-by-area.js";

test("groupProjectsByNestedArea buckets by areaId and leaves ungrouped first", () => {
  const groups = groupProjectsByNestedArea(
    [
      { id: "a", area: "clients", areaId: "web", sortOrder: 1 },
      { id: "b", area: "clients", areaId: null, sortOrder: 2 },
      { id: "c", area: "clients", areaId: "web", sortOrder: 3 },
      { id: "d", area: "clients", areaId: "missing", sortOrder: 4 },
    ],
    [
      { id: "web", name: "Webdevelopment", parent: "clients", sortOrder: 10 },
      { id: "ops", name: "Ops", parent: "clients", sortOrder: 20 },
    ],
  );

  assert.deepEqual(
    groups.map((group) => ({
      areaId: group.areaId,
      name: group.name,
      showHeader: group.showHeader,
      ids: group.projects.map((project) => (project as { id: string }).id),
    })),
    [
      {
        areaId: null,
        name: null,
        showHeader: false,
        ids: ["b", "d"],
      },
      {
        areaId: "web",
        name: "Webdevelopment",
        showHeader: true,
        ids: ["a", "c"],
      },
    ],
  );
});

test("groupProjectsByNestedArea returns a single ungrouped bucket when no nested areas match", () => {
  const groups = groupProjectsByNestedArea(
    [{ id: "a", area: "personal", areaId: null }],
    [{ id: "web", name: "Web", parent: "clients" }],
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.showHeader, false);
  assert.deepEqual(
    groups[0]?.projects.map((project) => (project as { id: string }).id),
    ["a"],
  );
});
