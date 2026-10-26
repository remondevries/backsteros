import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSyncIssuesFromSnapshot,
  buildSyncingHealthFacts,
  type SyncingSnapshot,
} from "./sync-issue-model.ts";

function emptySnapshot(
  overrides: Partial<SyncingSnapshot> = {},
): SyncingSnapshot {
  return {
    offline: false,
    powerSyncStatus: "ready",
    powerSyncMessage: "PowerSync ready",
    powerSyncErrorMessage: null,
    uploadErrorMessage: null,
    lastSyncedAt: new Date("2026-10-26T10:00:00.000Z"),
    connected: true,
    uploadItems: [],
    deadLetters: [],
    deadLetterCount: 0,
    mismatches: [],
    healthFetchError: null,
    healthAuthDenied: false,
    versionDrift: null,
    ...overrides,
  };
}

describe("buildSyncIssuesFromSnapshot", () => {
  it("returns no issues when healthy", () => {
    assert.deepEqual(buildSyncIssuesFromSnapshot(emptySnapshot()), []);
  });

  it("surfaces offline ahead of connecting", () => {
    const issues = buildSyncIssuesFromSnapshot(
      emptySnapshot({
        offline: true,
        powerSyncStatus: "connecting",
        uploadItems: [
          {
            id: "1",
            label: "tasks/abc",
            op: "PATCH",
            age: "1 min ago",
            status: "pending",
          },
        ],
      }),
    );
    assert.equal(issues.some((issue) => issue.id === "offline"), true);
    assert.equal(issues.some((issue) => issue.id === "upload-stuck"), true);
    assert.equal(issues.some((issue) => issue.id === "connecting"), false);
  });

  it("surfaces dead letters and powersync errors", () => {
    const issues = buildSyncIssuesFromSnapshot(
      emptySnapshot({
        powerSyncStatus: "error",
        powerSyncErrorMessage: "token exchange failed",
        deadLetterCount: 1,
        deadLetters: [
          {
            id: "dl1",
            tableName: "tasks",
            rowId: "t1",
            direction: "cloud → local",
            errorCode: "fk_parent_missing",
            errorMessage: "missing project",
            attempts: 3,
            firstSeenAt: "2026-10-26T09:00:00.000Z",
            lastSeenAt: "2026-10-26T09:30:00.000Z",
            nextRetryAt: "2026-10-26T10:05:00.000Z",
          },
        ],
      }),
    );
    assert.deepEqual(
      issues.map((issue) => issue.id),
      ["powersync-error", "dead-letter"],
    );
  });

  it("builds healthy facts for the empty state", () => {
    const facts = buildSyncingHealthFacts(emptySnapshot(), Date.parse("2026-10-26T10:00:10.000Z"));
    assert.equal(facts.powerSyncLabel, "Connected");
    assert.equal(facts.uploadQueueLabel, "Empty");
    assert.equal(facts.peerLabel, "Reachable");
    assert.equal(facts.lastSyncLabel, "Just now");
  });

  it("surfaces version drift from /health", () => {
    const issues = buildSyncIssuesFromSnapshot(
      emptySnapshot({
        versionDrift: {
          localCommit: "abc1234deadbeef",
          peerCommit: "def5678cafebabe",
          updateHint: "Run scripts/local-core/update-build.sh",
        },
      }),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.id, "version-drift");
    assert.equal(issues[0]?.payload.kind, "version-drift");
  });
});
