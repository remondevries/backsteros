import { describe, expect, it } from "vite-plus/test";

import {
  groupBacksterosProjectsByStatus,
  migrateBacksterosProjectStatus,
} from "./projectStatus";

describe("groupBacksterosProjectsByStatus", () => {
  it("groups and orders by BacksterOS status order", () => {
    const groups = groupBacksterosProjectsByStatus([
      { id: "1", name: "Zeta", status: "completed", sortOrder: 2 },
      { id: "2", name: "Alpha", status: "active", sortOrder: 1 },
      { id: "3", name: "Beta", status: "active", sortOrder: 0 },
      { id: "4", name: "Old", status: "unknown-status", sortOrder: 0 },
    ]);

    expect(groups.map((group) => group.status)).toEqual(["backlog", "active", "completed"]);
    expect(groups[0]?.projects.map((project) => project.name)).toEqual(["Old"]);
    expect(groups[1]?.projects.map((project) => project.name)).toEqual(["Beta", "Alpha"]);
    expect(groups[2]?.projects.map((project) => project.name)).toEqual(["Zeta"]);
  });

  it("migrates unknown statuses to backlog", () => {
    expect(migrateBacksterosProjectStatus("planned")).toBe("backlog");
    expect(migrateBacksterosProjectStatus("on_hold")).toBe("on_hold");
  });
});
