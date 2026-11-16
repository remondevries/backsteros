import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEAVE_OPEN_ROW_IDS,
  LEAVE_OPEN_TABLES,
  RETRY_MEETING_ROW_IDS,
  isLeaveOpenLetter,
  describeDatabaseTarget,
  executeDeadLetterCleanup,
  parseCleanupArgs,
  planDeadLetterCleanup,
  type OpenDeadLetterRef,
} from "./dead-letter-cleanup.js";

function letter(
  id: string,
  tableName: string,
  rowId: string,
  direction = "pull",
): OpenDeadLetterRef {
  return { id, tableName, rowId, direction };
}

describe("dead-letter cleanup plan", () => {
  it("retries exactly the five meeting row ids", () => {
    assert.deepEqual([...RETRY_MEETING_ROW_IDS], [
      "12d3b2edd1c74e13bd819580e1e5fb54",
      "62baf908e05b46b0b519cd3a44b34ceb",
      "tjOOjQZQMd-fd3V6HQvds",
      "EjscGQPOsPzgIkQYVnMfa",
      "lFgsQ_VnWiew-g1r3RIMp",
    ]);
  });

  it("retries only meetings with those ids and acknowledges everything else", () => {
    const open = [
      letter("dl1", "meetings", "12d3b2edd1c74e13bd819580e1e5fb54"),
      letter("dl2", "meetings", "tjOOjQZQMd-fd3V6HQvds", "push"),
      letter("dl3", "meetings", "some-other-meeting"),
      // Same row id on a different table must not be retried.
      letter("dl4", "tasks", "EjscGQPOsPzgIkQYVnMfa"),
      letter("dl5", "contacts", "c1"),
    ];
    const plan = planDeadLetterCleanup(open);
    assert.deepEqual(plan.retry.map((l) => l.id), ["dl1", "dl2"]);
    assert.deepEqual(plan.acknowledge.map((l) => l.id), ["dl3", "dl4", "dl5"]);
    assert.deepEqual(plan.leaveOpen, []);
    assert.deepEqual(plan.retryRowIdsWithoutOpenLetter, [
      "62baf908e05b46b0b519cd3a44b34ceb",
      "EjscGQPOsPzgIkQYVnMfa",
      "lFgsQ_VnWiew-g1r3RIMp",
    ]);
  });

  it("leaves the 7 live email-thread forks and all email_threads/projects letters open", () => {
    assert.equal(LEAVE_OPEN_ROW_IDS.length, 7);
    assert.deepEqual([...LEAVE_OPEN_TABLES].sort(), ["email_threads", "projects"]);
    const forks = LEAVE_OPEN_ROW_IDS.map((rowId, i) =>
      letter(`fork${i}`, "email_threads", rowId),
    );
    const open = [
      ...forks,
      letter("t1", "email_threads", "some-orphan-thread"),
      letter("p1", "projects", "live-project"),
      // Fork id on another table is also kept (id match is table-agnostic).
      letter("x1", "tasks", LEAVE_OPEN_ROW_IDS[0]!),
      letter("g1", "tasks", "ghost-task"),
      letter("m1", "meetings", "12d3b2edd1c74e13bd819580e1e5fb54"),
    ];
    const plan = planDeadLetterCleanup(open);
    assert.deepEqual(
      plan.leaveOpen.map((l) => l.id),
      [...forks.map((l) => l.id), "t1", "p1", "x1"],
    );
    assert.deepEqual(plan.acknowledge.map((l) => l.id), ["g1"]);
    assert.deepEqual(plan.retry.map((l) => l.id), ["m1"]);
    assert.equal(isLeaveOpenLetter({ tableName: "tasks", rowId: "ghost-task" }), false);
  });

  it("never acknowledges leave-open letters when executing", async () => {
    const calls: string[] = [];
    const plan = planDeadLetterCleanup([
      letter("p1", "projects", "live-project"),
      letter("e1", "email_threads", LEAVE_OPEN_ROW_IDS[0]!),
      letter("g1", "tasks", "ghost-task"),
    ]);
    await executeDeadLetterCleanup(plan, {
      retryById: async (id) => {
        calls.push(`retry:${id}`);
        return { status: "failed" };
      },
      acknowledgeById: async (id) => {
        calls.push(`ack:${id}`);
        return { status: "acknowledged" };
      },
    });
    assert.deepEqual(calls, ["ack:g1"]);
  });

  it("executes retries first, then acknowledges; never acks a retried letter", async () => {
    const calls: string[] = [];
    const plan = planDeadLetterCleanup([
      letter("dl1", "meetings", "12d3b2edd1c74e13bd819580e1e5fb54"),
      letter("dl2", "contacts", "c1"),
    ]);
    const result = await executeDeadLetterCleanup(plan, {
      retryById: async (id) => {
        calls.push(`retry:${id}`);
        return { status: "failed" };
      },
      acknowledgeById: async (id) => {
        calls.push(`ack:${id}`);
        return { status: "acknowledged" };
      },
    });
    assert.deepEqual(calls, ["retry:dl1", "ack:dl2"]);
    assert.equal(result.retried[0]?.status, "failed");
    assert.equal(result.acknowledged[0]?.status, "acknowledged");
  });
});

describe("dead-letter cleanup CLI args", () => {
  it("defaults to dry-run", () => {
    assert.deepEqual(parseCleanupArgs([]), { confirmCloud: false });
    assert.deepEqual(parseCleanupArgs(["--"]), { confirmCloud: false });
  });

  it("requires the explicit --confirm-cloud flag to execute", () => {
    assert.deepEqual(parseCleanupArgs(["--confirm-cloud"]), {
      confirmCloud: true,
    });
  });

  it("rejects unknown flags", () => {
    assert.throws(() => parseCleanupArgs(["--yes"]), /unknown argument/);
  });

  it("describes the database target without credentials", () => {
    assert.equal(
      describeDatabaseTarget("postgresql://user:secret@db.example:5432/backsteros"),
      "db.example:5432/backsteros",
    );
    assert.equal(describeDatabaseTarget(undefined), "<DATABASE_URL not set>");
  });
});
