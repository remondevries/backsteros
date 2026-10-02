import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTaskNumberUniqueViolation,
  taskNumberKeeper,
  taskNumberScopeId,
  TASK_NUMBER_UNIQUE_CONSTRAINT,
} from "./task-number-conflicts.js";

describe("task-number collision resolution (OS-70)", () => {
  const earlier = new Date("2026-08-28T10:00:00.000Z");
  const later = new Date("2026-08-31T12:00:00.000Z");

  it("keeps the earlier-created task's number", () => {
    const local = { id: "local-earlier", createdAt: earlier };
    const cloud = { id: "cloud-later", createdAt: later };
    assert.equal(taskNumberKeeper(local, cloud).id, "local-earlier");
    assert.equal(taskNumberKeeper(cloud, local).id, "local-earlier");
  });

  it("is symmetric on both peers, including created_at ties", () => {
    for (const [a, b] of [
      [earlier, later],
      [later, earlier],
      [earlier, earlier],
    ] as const) {
      const x = { id: "Q1FnEswI72dvJBvWtMEoo", createdAt: a };
      const y = { id: "b25LfJlVEOIYKuF1gqlcp", createdAt: b };
      const onPeer1 = taskNumberKeeper(x, y).id;
      const onPeer2 = taskNumberKeeper(y, x).id;
      assert.equal(onPeer1, onPeer2);
    }
  });

  it("tie on created_at keeps the smaller id", () => {
    assert.equal(
      taskNumberKeeper(
        { id: "b", createdAt: earlier },
        { id: "a", createdAt: earlier },
      ).id,
      "a",
    );
  });

  it("an unparseable created_at loses to a valid one", () => {
    assert.equal(
      taskNumberKeeper(
        { id: "a", createdAt: new Date("nope") },
        { id: "b", createdAt: earlier },
      ).id,
      "b",
    );
  });

  it("detects only the task-number unique constraint", () => {
    assert.equal(
      isTaskNumberUniqueViolation({
        code: "23505",
        constraint: TASK_NUMBER_UNIQUE_CONSTRAINT,
      }),
      true,
    );
    assert.equal(
      isTaskNumberUniqueViolation({
        code: "23505",
        constraint_name: "tasks_habit_due_unique",
      }),
      false,
    );
  });

  it("builds the same scope ids as nextTaskNumber", () => {
    assert.equal(taskNumberScopeId("proj-1", null), "project:proj-1");
    assert.equal(taskNumberScopeId(null, "contact-1"), "contact:contact-1");
    assert.equal(taskNumberScopeId(null, null), "__inbox__");
  });
});
