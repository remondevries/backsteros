import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupProjectsByType,
  projectTypeCollapseKey,
} from "./group-projects-by-type.js";

test("groupProjectsByType keeps general unlabeled and labels codebase", () => {
  const groups = groupProjectsByType([
    { id: "a", type: "general" },
    { id: "b", type: "codebase" },
    { id: "c", type: null },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.type, "general");
  assert.equal(groups[0]?.showHeader, false);
  assert.deepEqual(
    groups[0]?.projects.map((p) => (p as { id: string }).id),
    ["a", "c"],
  );
  assert.equal(groups[1]?.type, "codebase");
  assert.equal(groups[1]?.showHeader, true);
  assert.equal(groups[1]?.label, "Codebase");
  assert.deepEqual(
    groups[1]?.projects.map((p) => (p as { id: string }).id),
    ["b"],
  );
});

test("groupProjectsByType omits empty type buckets", () => {
  const groups = groupProjectsByType([{ id: "a", type: "codebase" }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.type, "codebase");
});

test("projectTypeCollapseKey nests status and type", () => {
  assert.equal(projectTypeCollapseKey("active", "codebase"), "active:codebase");
});
