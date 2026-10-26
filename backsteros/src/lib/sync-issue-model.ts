/**
 * Live Syncing workbench issue model — built from PowerSync + ops sync-health.
 */

import type { ReplicationDeadLetter } from "./replication-dead-letters";

export type SyncIssueTone = "error" | "warning" | "info" | "neutral";

export type SyncIssueLayoutId =
  | "conflict"
  | "offline"
  | "connecting"
  | "powersync-error"
  | "upload-stuck"
  | "validation-rejected"
  | "dead-letter"
  | "peer-down"
  | "twin-lag"
  | "vault-failed"
  | "missing-blob"
  | "draft-protected"
  | "version-drift";

export type SyncUploadQueueItem = {
  id: string;
  label: string;
  op: string;
  age: string;
  status: "pending" | "retrying" | "failed";
};

export type SyncReconcileMismatch = {
  tableName: string;
  localCount: number;
  peerCount: number;
  missingLocally: number;
  missingOnPeer: number;
  checkedAt: string;
};

export type SyncIssuePayload =
  | {
      kind: "offline";
      lastSyncedLabel: string;
      queuedWrites: number;
    }
  | { kind: "connecting" }
  | {
      kind: "powersync-error";
      code: string;
      endpoint: string;
      log: string;
    }
  | {
      kind: "upload-stuck";
      items: SyncUploadQueueItem[];
      uploadError: string | null;
    }
  | {
      kind: "dead-letter";
      letters: ReplicationDeadLetter[];
      count: number;
    }
  | {
      kind: "peer-down";
      peerHint: string;
      lastError: string;
    }
  | {
      kind: "twin-lag";
      mismatches: SyncReconcileMismatch[];
    }
  | {
      kind: "version-drift";
      localCommit: string;
      peerCommit: string;
      updateHint: string;
    };

export type SyncIssueInstance = {
  /** Stable id for triage selection (usually equals layoutId for channel issues). */
  id: SyncIssueLayoutId;
  layoutId: SyncIssueLayoutId;
  tone: SyncIssueTone;
  badge: string;
  title: string;
  detail: string;
  summary: string;
  payload: SyncIssuePayload;
};

export type SyncingHealthFacts = {
  powerSyncLabel: string;
  uploadQueueLabel: string;
  peerLabel: string;
  lastSyncLabel: string;
};

export type SyncingSnapshot = {
  offline: boolean;
  powerSyncStatus:
    | "idle"
    | "unauthenticated"
    | "connecting"
    | "ready"
    | "error";
  powerSyncMessage: string;
  powerSyncErrorMessage: string | null;
  uploadErrorMessage: string | null;
  lastSyncedAt: Date | null;
  connected: boolean;
  uploadItems: SyncUploadQueueItem[];
  deadLetters: ReplicationDeadLetter[];
  deadLetterCount: number;
  mismatches: SyncReconcileMismatch[];
  /** Ops sync-health request failed (network / 5xx). */
  healthFetchError: string | null;
  /** Ops sync-health returned 401/403. */
  healthAuthDenied: boolean;
  /** From GET /health when versionMismatch is true. */
  versionDrift: {
    localCommit: string;
    peerCommit: string;
    updateHint: string;
  } | null;
};

export function formatRelativeSyncTime(
  value: Date | string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const delta = nowMs - date.getTime();
  if (delta < 15_000) return "Just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function buildSyncingHealthFacts(
  snapshot: SyncingSnapshot,
  nowMs: number = Date.now(),
): SyncingHealthFacts {
  const powerSyncLabel = snapshot.offline
    ? "Offline"
    : snapshot.powerSyncStatus === "ready" && snapshot.connected
      ? "Connected"
      : snapshot.powerSyncStatus === "connecting"
        ? "Connecting"
        : snapshot.powerSyncStatus === "error"
          ? "Error"
          : snapshot.connected
            ? "Connected"
            : "Idle";

  const uploadQueueLabel =
    snapshot.uploadItems.length === 0
      ? "Empty"
      : `${snapshot.uploadItems.length} waiting`;

  const peerLabel = snapshot.healthAuthDenied
    ? "Auth required"
    : snapshot.healthFetchError
      ? "Unreachable"
      : "Reachable";

  return {
    powerSyncLabel,
    uploadQueueLabel,
    peerLabel,
    lastSyncLabel: formatRelativeSyncTime(snapshot.lastSyncedAt, nowMs),
  };
}

/**
 * Pure adapter: live snapshot → triage queue (severity order).
 * Only emits issue types we can actually observe today.
 */
export function buildSyncIssuesFromSnapshot(
  snapshot: SyncingSnapshot,
  nowMs: number = Date.now(),
): SyncIssueInstance[] {
  const issues: SyncIssueInstance[] = [];
  const lastSyncedLabel = formatRelativeSyncTime(snapshot.lastSyncedAt, nowMs);

  if (snapshot.powerSyncStatus === "error" && !snapshot.offline) {
    const message =
      snapshot.powerSyncErrorMessage ??
      snapshot.powerSyncMessage ??
      "PowerSync failed to start";
    issues.push({
      id: "powersync-error",
      layoutId: "powersync-error",
      tone: "error",
      badge: "Sync unavailable",
      title: "PowerSync could not start",
      detail: "Fix credentials or service health, then retry the channel.",
      summary: truncateSummary(message),
      payload: {
        kind: "powersync-error",
        code: inferErrorCode(message),
        endpoint: "/api/v1/powersync/token",
        log: message,
      },
    });
  }

  if (snapshot.deadLetterCount > 0 || snapshot.deadLetters.length > 0) {
    const first = snapshot.deadLetters[0];
    const count = Math.max(snapshot.deadLetterCount, snapshot.deadLetters.length);
    issues.push({
      id: "dead-letter",
      layoutId: "dead-letter",
      tone: "error",
      badge: count === 1 ? "Dead letter" : `Dead letters · ${count}`,
      title:
        count === 1
          ? "Replication apply blocked"
          : `${count} replication apply failures`,
      detail: "Retry the payload or acknowledge to unblock sync-event pull.",
      summary: first
        ? `${first.tableName} · ${first.errorCode ?? "apply_error"} · attempt ${first.attempts}`
        : `${count} open`,
      payload: {
        kind: "dead-letter",
        letters: snapshot.deadLetters,
        count,
      },
    });
  }

  if (snapshot.offline) {
    issues.push({
      id: "offline",
      layoutId: "offline",
      tone: "warning",
      badge: "Offline",
      title: "This Mac is offline",
      detail:
        "Writes stay queued locally. Resolve by reconnecting — nothing to merge.",
      summary: `Last synced · ${lastSyncedLabel} · ${snapshot.uploadItems.length} queued`,
      payload: {
        kind: "offline",
        lastSyncedLabel,
        queuedWrites: snapshot.uploadItems.length,
      },
    });
  }

  if (
    snapshot.uploadItems.length > 0 ||
    Boolean(snapshot.uploadErrorMessage)
  ) {
    issues.push({
      id: "upload-stuck",
      layoutId: "upload-stuck",
      tone: "warning",
      badge: "Upload queue",
      title: "Local changes waiting to upload",
      detail: snapshot.uploadErrorMessage
        ? "Upload failed — retry the queue or wait for the network."
        : "Review the queue, retry failed items, or wait for the network.",
      summary:
        snapshot.uploadItems.length > 0
          ? `${snapshot.uploadItems.length} waiting · oldest ${snapshot.uploadItems[0]!.label}`
          : truncateSummary(snapshot.uploadErrorMessage ?? "Upload error"),
      payload: {
        kind: "upload-stuck",
        items: snapshot.uploadItems,
        uploadError: snapshot.uploadErrorMessage,
      },
    });
  }

  if (snapshot.healthFetchError && !snapshot.healthAuthDenied) {
    issues.push({
      id: "peer-down",
      layoutId: "peer-down",
      tone: "warning",
      badge: "Peer down",
      title: "Cannot reach ops sync health",
      detail: "Test the link to local-core / cloud-core, then refresh.",
      summary: truncateSummary(snapshot.healthFetchError),
      payload: {
        kind: "peer-down",
        peerHint: "GET /api/v1/ops/sync-health",
        lastError: snapshot.healthFetchError,
      },
    });
  }

  if (snapshot.versionDrift) {
    const drift = snapshot.versionDrift;
    issues.push({
      id: "version-drift",
      layoutId: "version-drift",
      tone: "warning",
      badge: "Version drift",
      title: "Local-core build does not match peer",
      detail: "Update or redeploy so both cores report the same commit.",
      summary: `${shortCommit(drift.localCommit)} ≠ ${shortCommit(drift.peerCommit)}`,
      payload: {
        kind: "version-drift",
        localCommit: drift.localCommit,
        peerCommit: drift.peerCommit,
        updateHint: drift.updateHint,
      },
    });
  }

  if (snapshot.mismatches.length > 0) {
    const first = snapshot.mismatches[0]!;
    issues.push({
      id: "twin-lag",
      layoutId: "twin-lag",
      tone: "info",
      badge: "Lagging",
      title: "Twin tables are behind",
      detail: "Usually clears on the next replication tick — monitor lag only.",
      summary: `${snapshot.mismatches.length} table${snapshot.mismatches.length === 1 ? "" : "s"} · ${first.tableName}`,
      payload: {
        kind: "twin-lag",
        mismatches: snapshot.mismatches,
      },
    });
  }

  if (snapshot.powerSyncStatus === "connecting" && !snapshot.offline) {
    issues.push({
      id: "connecting",
      layoutId: "connecting",
      tone: "info",
      badge: "Connecting",
      title: "Connecting PowerSync",
      detail: "Handshake in progress. Workspace is read-mostly until ready.",
      summary: "Opening sync channel…",
      payload: { kind: "connecting" },
    });
  }

  return issues;
}

function truncateSummary(value: string, max = 72): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function shortCommit(commit: string, length = 12): string {
  const trimmed = commit.trim() || "unknown";
  if (trimmed === "unknown" || trimmed.length <= length) return trimmed;
  return trimmed.slice(0, length);
}

function inferErrorCode(message: string): string {
  const match = message.match(/\b([a-z][a-z0-9_]{2,})\b/i);
  if (message.toLowerCase().includes("token")) return "token_exchange_failed";
  if (message.toLowerCase().includes("timeout")) return "connect_timeout";
  return match?.[1] ?? "powersync_error";
}
