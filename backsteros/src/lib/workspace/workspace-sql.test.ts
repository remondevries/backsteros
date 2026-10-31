import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALL_TASKS_LIST_SQL,
  DOCUMENTS_LIST_SQL,
  MEETINGS_LIST_SOFT_LIMIT,
  MEETINGS_LIST_SQL,
  MEETING_LIST_COLUMNS,
  WORKSPACE_LIST_SOFT_LIMIT,
} from "./workspace-sql";

describe("workspace list SQL soft caps (OS-163 #4)", () => {
  it("omits notes and transcription from meeting list columns", () => {
    assert.equal(MEETING_LIST_COLUMNS.includes("notes"), false);
    assert.equal(MEETING_LIST_COLUMNS.includes("transcription"), false);
  });

  it("applies soft LIMIT to always-on list watches", () => {
    assert.ok(ALL_TASKS_LIST_SQL.includes(`LIMIT ${WORKSPACE_LIST_SOFT_LIMIT}`));
    assert.ok(DOCUMENTS_LIST_SQL.includes(`LIMIT ${WORKSPACE_LIST_SOFT_LIMIT}`));
    assert.ok(
      MEETINGS_LIST_SQL.includes(`LIMIT ${MEETINGS_LIST_SOFT_LIMIT}`),
    );
    assert.ok(MEETINGS_LIST_SQL.includes("ORDER BY start_at DESC"));
  });
});
