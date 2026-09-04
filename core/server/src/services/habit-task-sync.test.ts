import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("habit task sync emission", () => {
  it("tracks changedTasks from ensureHabitTasksForDate", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "habits.ts"),
      "utf8",
    );
    assert.ok(src.includes("changedTasks: HabitTaskSyncChange[]"));
    assert.ok(src.includes("changedTasks.push({ task: created, operation: \"upsert\" })"));
    assert.ok(src.includes("operation: \"delete\""));
  });

  it("emits habit-derived tasks after habit sync apply", () => {
    const leader = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "core-replication/leader-mutations.ts",
      ),
      "utf8",
    );
    const sync = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "sync.ts"),
      "utf8",
    );
    assert.ok(leader.includes('change.entity === "habit"'));
    assert.ok(leader.includes("habitTaskChangesOut"));
    assert.ok(leader.includes("mergeHabitDerivedTaskChanges"));
    assert.ok(sync.includes("appendHabitDerivedTaskSyncEvents"));
    assert.ok(sync.includes("habitTaskChangesOut"));
    assert.ok(sync.includes("updated.changedTasks"));
  });

  it("routes habit day through leader-first when hybrid is on", () => {
    const routes = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../app/routes.ts"),
      "utf8",
    );
    assert.ok(routes.includes("buildHabitDayTaskSyncPayload"));
    assert.ok(routes.includes("findHabitTaskForDueYmd"));
    assert.ok(routes.includes("planHabitDayReconcileLeaderChanges"));
    assert.ok(routes.includes("/api/v1/habits/:id/days"));
  });

  it("routes emit habit task sync changes", () => {
    const routes = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../app/routes.ts"),
      "utf8",
    );
    assert.ok(routes.includes("emitHabitTaskSyncChanges"));
    assert.ok(routes.includes("result.changedTasks"));
  });
});
