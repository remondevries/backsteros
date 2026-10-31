import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TASK_ACTIVITIES_SQL,
  TASK_ACTIVITY_FEED_LIMIT,
} from "./task-activity-feed";

describe("task activity feed SQL (OS-163 #5)", () => {
  it("limits activities and filters deleted rows in SQL", () => {
    assert.equal(TASK_ACTIVITY_FEED_LIMIT, 100);
    assert.ok(TASK_ACTIVITIES_SQL.includes("deleted_at IS NULL"));
    assert.ok(TASK_ACTIVITIES_SQL.includes("ORDER BY created_at DESC"));
    assert.ok(
      TASK_ACTIVITIES_SQL.includes(`LIMIT ${TASK_ACTIVITY_FEED_LIMIT}`),
    );
  });

  it("does not watch task_comments for the local feed", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "task-activity-feed.ts"),
      "utf8",
    );
    assert.equal(src.includes("FROM task_comments"), false);
    assert.ok(src.includes("task_activities"));
  });
});
