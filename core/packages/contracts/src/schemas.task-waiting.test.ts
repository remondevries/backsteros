import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TASK_STATUSES,
  createTaskSchema,
  taskPatchKeepsWaitingFollowUp,
  taskStatusSchema,
  updateTaskSchema,
} from "./schemas.js";
import {
  buildWaitingStatusPatch,
  defaultWaitingFollowUpDateIso,
} from "./client-logic/task-waiting.js";

describe("waiting task status", () => {
  it("includes waiting between on_hold and in_review", () => {
    assert.ok(TASK_STATUSES.includes("waiting"));
    const onHold = TASK_STATUSES.indexOf("on_hold");
    const waiting = TASK_STATUSES.indexOf("waiting");
    const inReview = TASK_STATUSES.indexOf("in_review");
    assert.equal(waiting, onHold + 1);
    assert.equal(inReview, waiting + 1);
    assert.equal(taskStatusSchema.parse("waiting"), "waiting");
  });

  it("requires followUpDate when creating with status waiting", () => {
    const missing = createTaskSchema.safeParse({
      title: "Chase supplier",
      status: "waiting",
    });
    assert.equal(missing.success, false);

    const ok = createTaskSchema.safeParse({
      title: "Chase supplier",
      status: "waiting",
      followUpDate: "2026-10-29T00:00:00.000Z",
    });
    assert.equal(ok.success, true);
  });

  it("allows updates that keep an existing waiting follow-up", () => {
    assert.equal(
      taskPatchKeepsWaitingFollowUp({
        currentStatus: "waiting",
        currentFollowUpDate: "2026-10-29T00:00:00.000Z",
        nextStatus: "waiting",
      }),
      true,
    );
    assert.equal(
      taskPatchKeepsWaitingFollowUp({
        currentStatus: "in_progress",
        currentFollowUpDate: null,
        nextStatus: "waiting",
        nextFollowUpDate: "2026-10-29T00:00:00.000Z",
      }),
      true,
    );
    assert.equal(
      taskPatchKeepsWaitingFollowUp({
        currentStatus: "waiting",
        currentFollowUpDate: "2026-10-29T00:00:00.000Z",
        nextFollowUpDate: null,
      }),
      false,
    );
    assert.equal(
      taskPatchKeepsWaitingFollowUp({
        currentStatus: "in_progress",
        currentFollowUpDate: null,
        nextStatus: "waiting",
      }),
      false,
    );
  });

  it("allows non-waiting create/update without followUpDate", () => {
    assert.equal(
      createTaskSchema.safeParse({ title: "Normal", status: "backlog" })
        .success,
      true,
    );
    assert.equal(
      updateTaskSchema.safeParse({ status: "in_progress" }).success,
      true,
    );
  });

  it("defaults a chase date for waiting status patches", () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    assert.deepEqual(buildWaitingStatusPatch({ now }), {
      status: "waiting",
      followUpDate: defaultWaitingFollowUpDateIso(now),
    });
    assert.deepEqual(
      buildWaitingStatusPatch({
        currentFollowUpDate: "2026-11-01T00:00:00.000Z",
        now,
      }),
      { status: "waiting" },
    );
  });
});
