import { ApiClientError } from "@backsteros/api-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
import {
  IDLE_SYNC_EVENT_RESYNC,
  parseSyncEventResyncFacts,
  type SyncEventResyncFacts,
} from "./sync-event-resync-client";
import { useLocalCoreVersionMismatch } from "./use-local-core-version-mismatch";

const HEALTH_POLL_MS = 15_000;
/** Idle upload-queue poll — was 3s and re-rendered the whole shell every tick. */
const CRUD_POLL_IDLE_MS = 12_000;
/** Faster while uploads are pending so stuck queues still surface quickly. */
const CRUD_POLL_BUSY_MS = 4_000;

const EMPTY_UPLOAD_ITEMS: SyncUploadQueueItem[] = [];
const EMPTY_DEAD_LETTERS: ReplicationDeadLetter[] = [];
const EMPTY_MISMATCHES: SyncReconcileMismatch[] = [];

function uploadItemsEqual(
  left: readonly SyncUploadQueueItem[],
  right: readonly SyncUploadQueueItem[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (
      a.id !== b.id ||
      a.op !== b.op ||
      a.status !== b.status ||
      a.label !== b.label
    ) {
      return false;
    }
  }
  return true;
}

function deadLettersEqual(
  left: readonly ReplicationDeadLetter[],
  right: readonly ReplicationDeadLetter[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (
      a.id !== b.id ||
      a.attempts !== b.attempts ||
      a.lastSeenAt !== b.lastSeenAt ||
      a.errorMessage !== b.errorMessage
    ) {
      return false;
    }
  }
  return true;
}

function mismatchesEqual(
  left: readonly SyncReconcileMismatch[],
  right: readonly SyncReconcileMismatch[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (
      a.tableName !== b.tableName ||
      a.localCount !== b.localCount ||
      a.peerCount !== b.peerCount ||
      a.missingLocally !== b.missingLocally ||
      a.missingOnPeer !== b.missingOnPeer ||
      a.checkedAt !== b.checkedAt
    ) {
      return false;
    }
  }
  return true;
}

export type SyncingIssuesState = {
  loading: boolean;
  /** Live issues after shared dismissals (sidebar + Settings agree). */
  issues: SyncIssueInstance[];
  /** Raw live issues before local dismiss. */
  liveIssues: SyncIssueInstance[];
  health: SyncingHealthFacts;
  snapshot: SyncingSnapshot;
  dismissedIds: readonly SyncIssueLayoutId[];
  dismissIssue: (id: SyncIssueLayoutId) => void;
  refresh: () => Promise<void>;
  retryPowerSync: () => Promise<void>;
  flushUploads: () => Promise<boolean>;
  forceSync: () => Promise<{ uploaded: boolean }>;
  retryDeadLetter: (id: string) => Promise<void>;
  acknowledgeDeadLetter: (id: string) => Promise<void>;
  topIssue: SyncIssueInstance | null;
  hasIssues: boolean;
};

const SyncingIssuesContext = createContext<SyncingIssuesState | null>(null);

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
  if (!database) return EMPTY_UPLOAD_ITEMS;
  try {
    const batch = await database.getCrudBatch();
    if (!batch?.crud?.length) return EMPTY_UPLOAD_ITEMS;
    return batch.crud.slice(0, 20).map((entry, index) => ({
      id: String(entry.clientId ?? `${entry.table}:${entry.id}:${index}`),
      label: formatTableLabel(entry.table, entry.id),
      op: mapCrudOp(entry.op),
      age: "pending",
      status: uploadErrorMessage ? ("failed" as const) : ("pending" as const),
    }));
  } catch {
    return EMPTY_UPLOAD_ITEMS;
  }
}

/**
 * Single owner of PowerSync + ops sync-health → triage queue.
 * Mount once via {@link SyncingIssuesProvider} so sidebar and Settings share state.
 */
function useSyncingIssuesState(): SyncingIssuesState {
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
  const [syncEventResync, setSyncEventResync] =
    useState<SyncEventResyncFacts>(IDLE_SYNC_EVENT_RESYNC);
  const [dismissedIds, setDismissedIds] = useState<SyncIssueLayoutId[]>([]);
  const uploadCountRef = useRef(0);

  const uploadErrorMessage =
    powerSync.database?.currentStatus?.dataFlowStatus?.uploadError?.message ??
    null;

  const loadHealth = useCallback(async () => {
    try {
      const body = await client.requestJson<unknown>(OPS_SYNC_HEALTH_PATH);
      const parsed = parseOpsSyncHealthDeadLetters(body);
      setDeadLetters((prev) =>
        deadLettersEqual(prev, parsed.letters)
          ? prev
          : parsed.letters.length === 0
            ? EMPTY_DEAD_LETTERS
            : parsed.letters,
      );
      setDeadLetterCount((prev) =>
        prev === parsed.count ? prev : parsed.count,
      );
      setMismatches((prev) =>
        mismatchesEqual(prev, parsed.mismatches)
          ? prev
          : parsed.mismatches.length === 0
            ? EMPTY_MISMATCHES
            : parsed.mismatches,
      );
      setSyncEventResync(parseSyncEventResyncFacts(body));
      setHealthFetchError((prev) => (prev == null ? prev : null));
      setHealthAuthDenied((prev) => (prev ? false : prev));
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.status === 401 || error.status === 403) {
          setHealthAuthDenied((prev) => (prev ? prev : true));
          setHealthFetchError((prev) => (prev == null ? prev : null));
          setDeadLetters(EMPTY_DEAD_LETTERS);
          setDeadLetterCount(0);
          setMismatches(EMPTY_MISMATCHES);
          setSyncEventResync(IDLE_SYNC_EVENT_RESYNC);
          return;
        }
        setHealthFetchError(error.message);
      } else {
        setHealthFetchError(
          error instanceof Error ? error.message : "Could not load sync health.",
        );
      }
      setHealthAuthDenied((prev) => (prev ? false : prev));
      // Keep last known dead letters / mismatches — a transient fetch blip must
      // not flash Settings as Healthy while the sidebar still shows twin-lag.
    }
  }, [client]);

  const loadUploads = useCallback(async () => {
    const items = await readUploadQueue(powerSync.database, uploadErrorMessage);
    uploadCountRef.current = items.length;
    setUploadItems((prev) => {
      const next = items.length === 0 ? EMPTY_UPLOAD_ITEMS : items;
      return uploadItemsEqual(prev, next) ? prev : next;
    });
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
    let cancelled = false;
    let timer = 0;
    const scheduleNext = () => {
      const busy =
        uploadCountRef.current > 0 || Boolean(uploadErrorMessage);
      timer = window.setTimeout(() => {
        void (async () => {
          await loadUploads();
          if (!cancelled) scheduleNext();
        })();
      }, busy ? CRUD_POLL_BUSY_MS : CRUD_POLL_IDLE_MS);
    };
    void loadUploads().then(() => {
      if (!cancelled) scheduleNext();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadUploads, uploadErrorMessage]);

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
      syncEventResync: {
        needed: syncEventResync.needed,
        status: syncEventResync.status,
        message: syncEventResync.message,
      },
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
      syncEventResync.message,
      syncEventResync.needed,
      syncEventResync.status,
      uploadErrorMessage,
      uploadItems,
      versionMismatch,
    ],
  );

  const liveIssues = useMemo(
    () => buildSyncIssuesFromSnapshot(snapshot),
    [snapshot],
  );

  // Drop dismissals once the live source no longer reports that issue.
  useEffect(() => {
    const liveIds = new Set(liveIssues.map((issue) => issue.id));
    setDismissedIds((current) => current.filter((id) => liveIds.has(id)));
  }, [liveIssues]);

  const issues = useMemo(
    () => liveIssues.filter((issue) => !dismissedIds.includes(issue.id)),
    [dismissedIds, liveIssues],
  );

  const health = useMemo(
    () => buildSyncingHealthFacts(snapshot),
    [snapshot],
  );

  const dismissIssue = useCallback((id: SyncIssueLayoutId) => {
    setDismissedIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }, []);

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

  // Twin-lag / connecting are tone "info" (monitor-only). They stay in the
  // Settings triage list, but must not drive the sidebar alert or the
  // Settings "N issues" badge — otherwise the footer nags while Syncing
  // already looks healthy for actionable problems.
  const actionableIssues = useMemo(
    () => issues.filter((issue) => issue.tone === "error" || issue.tone === "warning"),
    [issues],
  );

  return useMemo(
    (): SyncingIssuesState => ({
      loading,
      issues,
      liveIssues,
      health,
      snapshot,
      dismissedIds,
      dismissIssue,
      refresh,
      retryPowerSync,
      flushUploads,
      forceSync,
      retryDeadLetter,
      acknowledgeDeadLetter,
      topIssue: actionableIssues[0] ?? null,
      hasIssues: actionableIssues.length > 0,
    }),
    [
      acknowledgeDeadLetter,
      actionableIssues,
      dismissIssue,
      dismissedIds,
      flushUploads,
      forceSync,
      health,
      issues,
      liveIssues,
      loading,
      refresh,
      retryDeadLetter,
      retryPowerSync,
      snapshot,
    ],
  );
}

export function SyncingIssuesProvider({ children }: { children: ReactNode }) {
  const value = useSyncingIssuesState();
  return (
    <SyncingIssuesContext.Provider value={value}>
      {children}
    </SyncingIssuesContext.Provider>
  );
}

/**
 * Shared Syncing triage queue (sidebar alert + Settings → Syncing).
 * Must be under {@link SyncingIssuesProvider}.
 */
export function useSyncingIssues(): SyncingIssuesState {
  const value = useContext(SyncingIssuesContext);
  if (!value) {
    throw new Error(
      "useSyncingIssues must be used inside SyncingIssuesProvider",
    );
  }
  return value;
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
