import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SYNC_ENTITIES,
  SYNC_OPERATIONS,
} from "../../lib/sync-constants.js";

describe("sync-event replication contracts", () => {
  it("keeps cashflow_planner_entry in the ordered entity set", () => {
    assert.ok(SYNC_ENTITIES.includes("cashflow_planner_entry"));
  });

  it("only allows upsert/patch/delete operations on the peer feed", () => {
    assert.deepEqual([...SYNC_OPERATIONS].sort(), [
      "delete",
      "patch",
      "upsert",
    ]);
  });
});
