import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyHabitUpdatePatch,
  habitPatchToSqlite,
} from "./habit-sqlite-fields.ts";

test("habitPatchToSqlite maps nextDueYmd to cadence_anchor_ymd", () => {
  assert.deepEqual(
    habitPatchToSqlite({ nextDueYmd: "2026-09-02" }),
    { cadence_anchor_ymd: "2026-09-02" },
  );
});

test("habitPatchToSqlite ignores unknown API-only keys", () => {
  assert.deepEqual(habitPatchToSqlite({ todayTaskId: "abc" }), {});
});

test("applyHabitUpdatePatch maps nextDueYmd to cadenceAnchorYmd", () => {
  const existing = {
    id: "h1",
    title: "Workout",
    icon: null,
    description: null,
    projectId: "p1",
    cadence: "daily" as const,
    cadenceAnchorYmd: "2026-09-01",
    sortOrder: 0,
    todayTaskId: null,
    todayTaskStatus: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    deletedAt: null,
  };
  const next = applyHabitUpdatePatch(
    existing,
    { nextDueYmd: "2026-09-05" },
    "2026-09-02T00:00:00.000Z",
  );
  assert.equal(next.cadenceAnchorYmd, "2026-09-05");
  assert.equal((next as { nextDueYmd?: string }).nextDueYmd, undefined);
});
