import assert from "node:assert/strict";
import { test } from "node:test";

import { diffProjectPatch } from "./project-patch-diff.ts";

test("diffProjectPatch returns only changed fields", () => {
  const previous = {
    name: "Alpha",
    key: "KA",
    status: "active",
    localWorkingDirectory: "/old",
    hourlyRateCents: 1000,
    budgets: [{ period: "monthly", amountCents: 10_000 }],
  };
  const next = {
    ...previous,
    status: "completed",
    localWorkingDirectory: "/new",
  };
  assert.deepEqual(diffProjectPatch(previous, next), {
    status: "completed",
    localWorkingDirectory: "/new",
  });
});

test("diffProjectPatch ignores unchanged full-row echoes", () => {
  const row = {
    name: "Alpha",
    key: "KA",
    status: "active",
    priority: 1,
    area: null,
    areaId: null,
    organizationId: "org-1",
    icon: null,
    type: "codebase",
    githubRepository: "acme/app",
    localWorkingDirectory: "/proj",
    healthCheckMode: null,
    healthCheckDomain: null,
    hourlyRateCents: 5000,
    budgets: [],
    startDate: null,
    dueDate: null,
    summary: "s",
    description: "d",
  };
  assert.deepEqual(diffProjectPatch(row, { ...row }), {});
});

test("diffProjectPatch treats missing previous as all present next fields", () => {
  assert.deepEqual(
    diffProjectPatch(null, { name: "X", key: "X", status: "active" }),
    { name: "X", key: "X", status: "active" },
  );
});
