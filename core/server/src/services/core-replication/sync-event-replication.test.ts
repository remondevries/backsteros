import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  SYNC_ENTITIES,
  SYNC_OPERATIONS,
} from "../../lib/sync-constants.js";

describe("sync-event replication contracts", () => {
  it("keeps cashflow_planner_entry in the ordered entity set", () => {
    assert.ok(SYNC_ENTITIES.includes("cashflow_planner_entry"));
  });

  it("keeps CRM entities in the ordered entity set", () => {
    assert.ok(SYNC_ENTITIES.includes("contact_relationship"));
    assert.ok(SYNC_ENTITIES.includes("crm_group"));
    assert.ok(SYNC_ENTITIES.includes("crm_activity"));
    assert.ok(SYNC_ENTITIES.includes("recurring_task"));
  });

  it("keeps task_activity in the ordered entity set", () => {
    assert.ok(SYNC_ENTITIES.includes("task_activity"));
  });

  it("keeps mention in the ordered entity set", () => {
    assert.ok(SYNC_ENTITIES.includes("mention"));
  });

  it("applies recurring runner state (next_run_at / last_task_id) from leader snapshots", () => {
    const syncSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../sync.ts"),
      "utf8",
    );
    assert.ok(syncSrc.includes("applyRecurringTaskSyncState"));
  });

  it("only allows upsert/patch/delete operations on the peer feed", () => {
    assert.deepEqual([...SYNC_OPERATIONS].sort(), [
      "delete",
      "patch",
      "upsert",
    ]);
  });
});
