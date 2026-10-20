import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProjectTypeExtraMenuItem } from "./project-type-menu-item.js";

test("buildProjectTypeExtraMenuItem marks the current type selected", () => {
  const changes: string[] = [];
  const item = buildProjectTypeExtraMenuItem("codebase", (type) => {
    changes.push(type);
  });

  assert.equal(item.id, "project-type");
  assert.equal(item.label, "Type");
  assert.equal(item.trailingLabel, "Codebase");
  assert.ok(item.submenu);
  assert.equal(item.submenu!.length, 6);

  const codebase = item.submenu!.find((entry) => entry.id === "project-type-codebase");
  const general = item.submenu!.find((entry) => entry.id === "project-type-general");
  assert.equal(codebase?.selected, true);
  assert.equal(general?.selected, false);

  codebase?.onSelect();
  assert.deepEqual(changes, []);

  general?.onSelect();
  assert.deepEqual(changes, ["general"]);
});
