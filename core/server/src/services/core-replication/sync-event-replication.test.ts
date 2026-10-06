import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
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

// pullPeerSyncEvents module graph loads db — set before dynamic import.
process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const {
  acknowledgePendingSyncEventPull,
  resetSyncEventPullRuntimeForTests,
  setSyncEventPullRuntimeEnabled,
} = await import("./config.js");
const { pullPeerSyncEvents, resetPendingPullPauseLogForTests } = await import(
  "./sync-event-replication.js"
);

describe("OS-82 pullPeerSyncEvents pending gate", () => {
  const previous = {
    peerUrl: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    role: process.env.CORE_REPLICATION_ROLE,
    workspaces: process.env.CORE_REPLICATION_WORKSPACE_IDS,
  };

  afterEach(() => {
    if (previous.peerUrl === undefined) delete process.env.CORE_REPLICATION_PEER_URL;
    else process.env.CORE_REPLICATION_PEER_URL = previous.peerUrl;
    if (previous.secret === undefined) delete process.env.CORE_REPLICATION_SECRET;
    else process.env.CORE_REPLICATION_SECRET = previous.secret;
    if (previous.role === undefined) delete process.env.CORE_REPLICATION_ROLE;
    else process.env.CORE_REPLICATION_ROLE = previous.role;
    if (previous.workspaces === undefined) {
      delete process.env.CORE_REPLICATION_WORKSPACE_IDS;
    } else {
      process.env.CORE_REPLICATION_WORKSPACE_IDS = previous.workspaces;
    }
    resetSyncEventPullRuntimeForTests();
    resetPendingPullPauseLogForTests();
  });

  it("skips the peer feed while pending and unacked; proceeds after ack", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = "os-82-pending-gate-secret";
    process.env.CORE_REPLICATION_ROLE = "local";
    process.env.CORE_REPLICATION_WORKSPACE_IDS = "ws-os82";
    setSyncEventPullRuntimeEnabled(true);

    let pulled = 0;
    const pending = {
      unpushedRowCount: 2,
      openDeadLetterCount: 0,
      localOnlyRowCount: 0,
      unpushedTables: ["tasks"],
    };

    await pullPeerSyncEvents({
      getPendingUnpushedState: async () => pending,
      pullWorkspaceSyncEvents: async () => {
        pulled += 1;
        return { applied: 0, duplicate: 0, skipped: 0 };
      },
    });
    assert.equal(pulled, 0, "must not fetch/apply peer feed while pending");

    acknowledgePendingSyncEventPull(pending);
    await pullPeerSyncEvents({
      getPendingUnpushedState: async () => pending,
      pullWorkspaceSyncEvents: async () => {
        pulled += 1;
        return { applied: 0, duplicate: 0, skipped: 0 };
      },
    });
    assert.equal(pulled, 1, "ack of shown snapshot allows pull to proceed");
  });
});
