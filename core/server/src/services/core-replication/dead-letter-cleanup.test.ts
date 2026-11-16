import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RETRY_MEETING_ROW_IDS,
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
      letter("dl5", "projects", "p1"),
    ];
    const plan = planDeadLetterCleanup(open);
    assert.deepEqual(plan.retry.map((l) => l.id), ["dl1", "dl2"]);
    assert.deepEqual(plan.acknowledge.map((l) => l.id), ["dl3", "dl4", "dl5"]);
    assert.deepEqual(plan.retryRowIdsWithoutOpenLetter, [
      "62baf908e05b46b0b519cd3a44b34ceb",
      "EjscGQPOsPzgIkQYVnMfa",
      "lFgsQ_VnWiew-g1r3RIMp",
    ]);
  });

  it("executes retries first, then acknowledges; never acks a retried letter", async () => {
    const calls: string[] = [];
    const plan = planDeadLetterCleanup([
      letter("dl1", "meetings", "12d3b2edd1c74e13bd819580e1e5fb54"),
      letter("dl2", "projects", "p1"),
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
