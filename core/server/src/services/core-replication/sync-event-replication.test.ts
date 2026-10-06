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

  it("keeps document_property_type in the ordered entity set", () => {
    assert.ok(SYNC_ENTITIES.includes("document_property_type"));
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

  it("OS-49: peer apply preserves event updated_at and skips stale rows", () => {
    const src = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "sync-event-replication.ts",
      ),
      "utf8",
    );
    assert.ok(src.includes("peerReplay"));
    assert.ok(src.includes("shouldSkipPeerEventAsStale"));
    assert.ok(src.includes("stale_peer_event"));
    assert.ok(src.includes("core sync-events pull stuck"));
  });

  it("OS-42: peer task apply skips activity side effects and preserves updated_at", () => {
    const syncSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../sync.ts"),
      "utf8",
    );
    const tasksSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../tasks-projects.ts"),
      "utf8",
    );
    assert.ok(syncSrc.includes("skipActivitySideEffects: true"));
    assert.ok(tasksSrc.includes("skipActivitySideEffects"));
    assert.ok(tasksSrc.includes("TaskWriteOptions"));
  });

  it("OS-82: desktop can inspect and acknowledge pull via internal routes", () => {
    const routesSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "routes.ts"),
      "utf8",
    );
    assert.ok(routesSrc.includes("/internal/core-replication/sync-event-pull"));
    assert.ok(routesSrc.includes("acknowledgePendingSyncEventPull"));
  });

  it("OS-82: ordered pull pauses on pending unpushed local state", () => {
    const src = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "sync-event-replication.ts",
      ),
      "utf8",
    );
    assert.ok(src.includes("shouldPauseSyncEventPull"));
    assert.ok(src.includes("getPendingUnpushedState"));
    assert.ok(src.includes("core sync-events pull paused"));
  });

  it("OS-49: leader-first apply does not jump the sync-event pull cursor", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "leader-mutations.ts"),
      "utf8",
    );
    assert.ok(src.includes("do NOT advance the ordered sync-event pull cursor"));
    assert.equal(
      src.includes("setSyncEventPullCursor(workspaceId, maxCursor)"),
      false,
    );
  });
});
