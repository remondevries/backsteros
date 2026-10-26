import { ApiClientError } from "@backsteros/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDesktopApi } from "./api-context";
import {
  LOCAL_CORE_UPDATE_BUILD_HINT,
  isVersionMismatchDismissed,
  versionMismatchDismissalKey,
} from "./local-core-version-mismatch";
import { useDesktopPowerSync } from "./powersync-context";
import {
  OPS_SYNC_HEALTH_PATH,
  parseOpsSyncHealthDeadLetters,
  replicationDeadLetterAcknowledgePath,
  replicationDeadLetterRetryPath,
  type ReplicationDeadLetter,
} from "./replication-dead-letters";
import {
  buildSyncIssuesFromSnapshot,
  buildSyncingHealthFacts,
  formatRelativeSyncTime,
  type SyncIssueInstance,
  type SyncIssueLayoutId,
  type SyncReconcileMismatch,
  type SyncUploadQueueItem,
  type SyncingHealthFacts,
  type SyncingSnapshot,
} from "./sync-issue-model";
import { useLocalCoreVersionMismatch } from "./use-local-core-version-mismatch";

const HEALTH_POLL_MS = 15_000;
const CRUD_POLL_MS = 3_000;

export type SyncingIssuesState = {
  loading: boolean;
  issues: SyncIssueInstance[];
  health: SyncingHealthFacts;
  snapshot: SyncingSnapshot;
  refresh: () => Promise<void>;
  retryPowerSync: () => Promise<void>;
  flushUploads: () => Promise<boolean>;
  forceSync: () => Promise<{ uploaded: boolean }>;
  retryDeadLetter: (id: string) => Promise<void>;
  acknowledgeDeadLetter: (id: string) => Promise<void>;
  topIssue: SyncIssueInstance | null;
  hasIssues: boolean;
};

function mapCrudOp(op: string): string {
  switch (op) {
    case "PUT":
      return "PUT";
    case "PATCH":
      return "PATCH";
    case "DELETE":
      return "DELETE";
    default:
      return op || "WRITE";
  }
}

function formatTableLabel(table: string, id: string): string {
  const shortId = id.length > 10 ? `${id.slice(0, 8)}…` : id;
  return `${table}/${shortId}`;
}

async function readUploadQueue(
  database: {
    getCrudBatch: () => Promise<{
      crud: Array<{
        op: string;
        table: string;
        id: string;
        clientId?: number;
      }>;
    } | null>;
  } | null,
  uploadErrorMessage: string | null,
): Promise<SyncUploadQueueItem[]> {
  if (!database) return [];
  try {
    const batch = await database.getCrudBatch();
    if (!batch?.crud?.length) return [];
    return batch.crud.slice(0, 20).map((entry, index) => ({
      id: String(entry.clientId ?? `${entry.table}:${entry.id}:${index}`),
      label: formatTableLabel(entry.table, entry.id),
      op: mapCrudOp(entry.op),
      age: "pending",
      status: uploadErrorMessage ? ("failed" as const) : ("pending" as const),
    }));
  } catch {
    return [];
  }
}

/**
 * Aggregates PowerSync channel state + ops sync-health into the Syncing triage queue.
 */
export function useSyncingIssues(): SyncingIssuesState {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const versionMismatch = useLocalCoreVersionMismatch();
  const [loading, setLoading] = useState(true);
  const [uploadItems, setUploadItems] = useState<SyncUploadQueueItem[]>([]);
  const [deadLetters, setDeadLetters] = useState<ReplicationDeadLetter[]>([]);
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const [mismatches, setMismatches] = useState<SyncReconcileMismatch[]>([]);
  const [healthFetchError, setHealthFetchError] = useState<string | null>(null);
  const [healthAuthDenied, setHealthAuthDenied] = useState(false);

  const uploadErrorMessage =
    powerSync.database?.currentStatus?.dataFlowStatus?.uploadError?.message ??
    null;

  const loadHealth = useCallback(async () => {
    try {
      const body = await client.requestJson<unknown>(OPS_SYNC_HEALTH_PATH);
      const parsed = parseOpsSyncHealthDeadLetters(body);
      setDeadLetters(parsed.letters);
      setDeadLetterCount(parsed.count);
      setMismatches(parsed.mismatches);
      setHealthFetchError(null);
      setHealthAuthDenied(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.status === 401 || error.status === 403) {
          setHealthAuthDenied(true);
          setHealthFetchError(null);
          setDeadLetters([]);
          setDeadLetterCount(0);
          setMismatches([]);
          return;
        }
        setHealthFetchError(error.message);
      } else {
        setHealthFetchError(
          error instanceof Error ? error.message : "Could not load sync health.",
        );
      }
      setHealthAuthDenied(false);
      setDeadLetters([]);
      setDeadLetterCount(0);
      setMismatches([]);
    }
  }, [client]);

  const loadUploads = useCallback(async () => {
    const items = await readUploadQueue(powerSync.database, uploadErrorMessage);
    setUploadItems(items);
  }, [powerSync.database, uploadErrorMessage]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadHealth(), loadUploads()]);
    } finally {
      setLoading(false);
    }
  }, [loadHealth, loadUploads]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      await loadHealth();
      if (!cancelled) setLoading(false);
    };
    void tick();
    const timer = window.setInterval(() => {
      void loadHealth();
    }, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadHealth]);

  useEffect(() => {
    void loadUploads();
    const timer = window.setInterval(() => {
      void loadUploads();
    }, CRUD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadUploads]);

  const snapshot = useMemo<SyncingSnapshot>(
    () => ({
      offline: powerSync.offline,
      powerSyncStatus: powerSync.status,
      powerSyncMessage: powerSync.message,
      powerSyncErrorMessage: powerSync.error?.message ?? null,
      uploadErrorMessage,
      lastSyncedAt: powerSync.lastSyncedAt,
      connected: powerSync.connected,
      uploadItems,
      deadLetters,
      deadLetterCount,
      mismatches,
      healthFetchError,
      healthAuthDenied,
      versionDrift:
        versionMismatch &&
        !isVersionMismatchDismissed(
          versionMismatchDismissalKey(versionMismatch),
        )
          ? {
              localCommit: versionMismatch.localCommit,
              peerCommit: versionMismatch.peerCommit,
              updateHint: LOCAL_CORE_UPDATE_BUILD_HINT,
            }
          : null,
    }),
    [
      deadLetterCount,
      deadLetters,
      healthAuthDenied,
      healthFetchError,
      mismatches,
      powerSync.connected,
      powerSync.error?.message,
      powerSync.lastSyncedAt,
      powerSync.message,
      powerSync.offline,
      powerSync.status,
      uploadErrorMessage,
      uploadItems,
      versionMismatch,
    ],
  );

  const issues = useMemo(
    () => buildSyncIssuesFromSnapshot(snapshot),
    [snapshot],
  );
  const health = useMemo(
    () => buildSyncingHealthFacts(snapshot),
    [snapshot],
  );

  const retryPowerSync = useCallback(async () => {
    await powerSync.retry();
    await refresh();
  }, [powerSync, refresh]);

  const flushUploads = useCallback(async () => {
    const uploaded = await powerSync.flushCrudUpload();
    await loadUploads();
    return uploaded;
  }, [loadUploads, powerSync]);

  const forceSync = useCallback(async () => {
    const result = await powerSync.forceSync();
    await refresh();
    return result;
  }, [powerSync, refresh]);

  const retryDeadLetter = useCallback(
    async (id: string) => {
      await client.requestJson(replicationDeadLetterRetryPath(id), {
        method: "POST",
      });
      await loadHealth();
    },
    [client, loadHealth],
  );

  const acknowledgeDeadLetter = useCallback(
    async (id: string) => {
      await client.requestJson(replicationDeadLetterAcknowledgePath(id), {
        method: "POST",
      });
      await loadHealth();
    },
    [client, loadHealth],
  );

  return {
    loading,
    issues,
    health,
    snapshot,
    refresh,
    retryPowerSync,
    flushUploads,
    forceSync,
    retryDeadLetter,
    acknowledgeDeadLetter,
    topIssue: issues[0] ?? null,
    hasIssues: issues.length > 0,
  };
}

export function isSyncIssueLayoutId(value: string): value is SyncIssueLayoutId {
  return (
    value === "conflict" ||
    value === "offline" ||
    value === "connecting" ||
    value === "powersync-error" ||
    value === "upload-stuck" ||
    value === "validation-rejected" ||
    value === "dead-letter" ||
    value === "peer-down" ||
    value === "twin-lag" ||
    value === "vault-failed" ||
    value === "missing-blob" ||
    value === "draft-protected" ||
    value === "version-drift"
  );
}

export { formatRelativeSyncTime };
