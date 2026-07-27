import assert from "node:assert/strict";
import { test } from "node:test";

import { groupProjectsByOrganization } from "../dist/group-projects-by-organization.js";

test("groupProjectsByOrganization buckets by organizationId and leaves ungrouped first", () => {
  const groups = groupProjectsByOrganization(
    [
      { id: "a", organizationId: "acme", sortOrder: 1 },
      { id: "b", organizationId: null, sortOrder: 2 },
      { id: "c", organizationId: "acme", sortOrder: 3 },
      { id: "d", organizationId: "missing", sortOrder: 4 },
    ],
    [
      { id: "acme", name: "Acme", sortOrder: 10 },
      { id: "beta", name: "Beta", sortOrder: 20 },
    ],
  );

  assert.deepEqual(
    groups.map((group) => ({
      organizationId: group.organizationId,
      name: group.name,
      showHeader: group.showHeader,
      ids: group.projects.map((project) => (project as { id: string }).id),
    })),
    [
      {
        organizationId: null,
        name: null,
        showHeader: false,
        ids: ["b", "d"],
      },
      {
        organizationId: "acme",
        name: "Acme",
        showHeader: true,
        ids: ["a", "c"],
      },
    ],
  );
});
