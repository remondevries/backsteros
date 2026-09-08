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
import type { PowerSyncDatabase } from "@powersync/web";

import {
  BacksterPowerSyncConnector,
  POWER_SYNC_CONNECT_TIMEOUT_MS,
  closePowerSyncDatabase,
  createPowerSyncDatabase,
  getPowerSyncGlobalSlot,
  setPowerSyncGlobalSlot,
} from "./powersync";
import { useDesktopApi } from "./api-context";
import { LOCAL_SHELL_USER_ID } from "./local-shell-auth";
import type { PowerSyncRowComparator } from "./powersync-row-comparators";
export type { PowerSyncRowComparator } from "./powersync-row-comparators";

async function connectWithTimeout(
  database: PowerSyncDatabase,
  connector: BacksterPowerSyncConnector,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await database.connect(connector);
        await database.waitForReady();
      })(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("PowerSync connect timed out"));
        }, POWER_SYNC_CONNECT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

export const SYNCED_METADATA_TABLES = [
  "projects",
  "tasks",
  "documents",
  "areas",
  "organizations",
  "contacts",
  "letters",
  "meetings",
  "workspace_settings",
  "bank_accounts",
  "financial_categories",
  "financial_goals",
  "financial_recurrings",
  "cashflow_planner_entries",
  "habits",
  "task_comments",
  "contact_relationships",
  "crm_relationship_labels",
  "crm_groups",
  "crm_group_members",
  "crm_activities",
] as const;

export type SyncedMetadataTable = (typeof SYNCED_METADATA_TABLES)[number];

type PowerSyncStatus =
  | "idle"
  | "unauthenticated"
  | "connecting"
  | "ready"
  | "error";

type SyncState = {
  status: PowerSyncStatus;
  message: string;
  database: PowerSyncDatabase | null;
  ready: boolean;
  connected: boolean;
  connecting: boolean;
  offline: boolean;
  lastSyncedAt: Date | null;
  error: Error | null;
  retry: () => Promise<void>;
  createMetadata: (
    table: SyncedMetadataTable,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  patchMetadata: (
    table: SyncedMetadataTable,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  /** Push pending CRUD to local-core. Returns true if at least one batch uploaded. */
  flushCrudUpload: () => Promise<boolean>;
};

const idleState: SyncState = {
  status: "idle",
  message: "PowerSync idle",
  database: null,
  ready: false,
  connected: false,
  connecting: false,
  offline: false,
  lastSyncedAt: null,
  error: null,
  retry: async () => {},
  createMetadata: async () => {
    throw new Error("Offline database is not ready");
  },
  patchMetadata: async () => {
    throw new Error("Offline database is not ready");
  },
  flushCrudUpload: async () => {
    throw new Error("Offline database is not ready");
  },
};

const PowerSyncContext = createContext<SyncState>(idleState);

function deviceId(): string {
  const key = "backsteros:desktop-powersync-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function UnauthenticatedPowerSyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useMemo<SyncState>(
    () => ({
      ...idleState,
      status: "unauthenticated",
      message: "PowerSync disabled",
    }),
    [],
  );
  return (
    <PowerSyncContext.Provider value={value}>
      {children}
    </PowerSyncContext.Provider>
  );
}

function AuthenticatedPowerSyncProvider({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: ReactNode;
}) {
  // Single-owner local shell: stable SQLite key.
  const userId = LOCAL_SHELL_USER_ID;
  const { client } = useDesktopApi();
  const clientRef = useRef(client);
  clientRef.current = client;

  const [databaseState, setDatabaseState] = useState<{
    userId: string;
    database: PowerSyncDatabase;
  } | null>(null);
  const database =
    databaseState?.userId === userId ? databaseState.database : null;
  const [offline, setOffline] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [, setStatusVersion] = useState(0);
  const databaseRef = useRef<PowerSyncDatabase | null>(null);
  const connectorRef = useRef<BacksterPowerSyncConnector | null>(null);
  const transitionRef = useRef(Promise.resolve());
  const disposeListenerRef = useRef<(() => void) | null>(null);
  const reconnectNonceRef = useRef(reconnectNonce);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const forceRecreate = reconnectNonceRef.current !== reconnectNonce;
    reconnectNonceRef.current = reconnectNonce;
    const existingAtStart = getPowerSyncGlobalSlot();
    const switchingUser = Boolean(
      userId && existingAtStart && existingAtStart.userId !== userId,
    );

    if (switchingUser || forceRecreate) {
      setDatabaseState(null);
      setInitError(null);
    }

    transitionRef.current = transitionRef.current.then(async () => {
      if (cancelled) return;

      // HMR / StrictMode remount: reuse the global singleton for this user.
      const existing = getPowerSyncGlobalSlot();
      if (existing && existing.userId === userId && !forceRecreate) {
        databaseRef.current = existing.database;
        disposeListenerRef.current?.();
        disposeListenerRef.current = existing.database.registerListener({
          statusChanged: () => setStatusVersion((version) => version + 1),
        });
        if (!cancelled) {
          setInitError(null);
          setDatabaseState({ userId, database: existing.database });
        }
        return;
      }

      // Identity change or explicit retry: close any prior handle first.
      const previous = existing?.database ?? databaseRef.current;
      databaseRef.current = null;
      connectorRef.current = null;
      disposeListenerRef.current?.();
      disposeListenerRef.current = null;
      setPowerSyncGlobalSlot(null);
      if (previous) {
        await closePowerSyncDatabase(previous, {
          clear: switchingUser,
        });
      }

      if (cancelled) return;

      try {
        const next = createPowerSyncDatabase(userId);
        // Publish early so a cancelled StrictMode/HMR pass can reuse instead of
        // racing a second sqlite3_open on the same IDB file.
        setPowerSyncGlobalSlot({ userId, database: next });
        databaseRef.current = next;

        const connector = new BacksterPowerSyncConnector(
          apiUrl,
          async () => null,
          deviceId(),
          async () => {
            for (let attempt = 0; attempt < 8; attempt++) {
              try {
                return await clientRef.current.getPowerSyncCredentials();
              } catch (reason) {
                console.warn("[desktop] PowerSync credentials failed", reason);
              }
              await new Promise((resolve) =>
                setTimeout(resolve, 120 * (attempt + 1)),
              );
            }
            throw new Error("Could not fetch PowerSync credentials");
          },
        );
        connectorRef.current = connector;
        disposeListenerRef.current = next.registerListener({
          statusChanged: () => setStatusVersion((version) => version + 1),
        });
        try {
          await connectWithTimeout(next, connector);
          if (!cancelled) setInitError(null);
          // Prior sessions left due-date PATCHes queued when auto-upload stalled.
          // Drain immediately on connect so local edits reach the leader.
          try {
            for (let i = 0; i < 50; i++) {
              const pending = await next.getCrudBatch();
              if (!pending) break;
              await connector.uploadData(next);
            }
          } catch (flushReason) {
            console.warn(
              "[desktop] PowerSync post-connect CRUD flush failed",
              flushReason,
            );
          }
        } catch (reason) {
          console.warn("[desktop] PowerSync connect failed", reason);
          if (!cancelled) {
            setInitError(
              reason instanceof Error
                ? reason
                : new Error("PowerSync connect failed"),
            );
          }
        }
        if (cancelled) {
          // Remount will reuse the singleton; only drop the listener.
          disposeListenerRef.current?.();
          disposeListenerRef.current = null;
          return;
        }
        setDatabaseState({ userId, database: next });
      } catch (reason) {
        console.warn("[desktop] PowerSync SQLite init failed", reason);
        const orphan = databaseRef.current;
        databaseRef.current = null;
        disposeListenerRef.current?.();
        disposeListenerRef.current = null;
        setPowerSyncGlobalSlot(null);
        if (orphan) {
          await closePowerSyncDatabase(orphan);
        }
        if (!cancelled) {
          setDatabaseState(null);
          setInitError(
            reason instanceof Error
              ? reason
              : new Error("PowerSync SQLite init failed"),
          );
        }
      }
    });
    return () => {
      cancelled = true;
      // Do not close the global singleton here — HMR / StrictMode remounts reuse
      // it. Module hot dispose and retry paths close explicitly.
      disposeListenerRef.current?.();
      disposeListenerRef.current = null;
    };
  }, [apiUrl, reconnectNonce, userId]);

  const retry = useCallback(async () => {
    // Always full re-init — soft reconnect can no-op when the previous connect
    // never reached fetchCredentials (worker/WASM failures).
    setInitError(null);
    setDatabaseState(null);
    setReconnectNonce((nonce) => nonce + 1);
  }, []);

  const patchMetadata = useCallback(
    async (
      table: SyncedMetadataTable,
      id: string,
      values: Record<string, unknown>,
    ) => {
      const db = databaseRef.current;
      if (!db) throw new Error("Offline database is not ready");
      const entries = Object.entries(values);
      if (!entries.length) return;
      const columns = entries.map(([key]) => {
        if (!/^[a-z_]+$/.test(key)) throw new Error("Invalid metadata field");
        return `${key} = ?`;
      });
      await db.execute(
        `UPDATE ${table} SET ${columns.join(", ")}, updated_at = ? WHERE id = ?`,
        [...entries.map(([, value]) => value), new Date().toISOString(), id],
      );
    },
    [],
  );

  const flushCrudUpload = useCallback(async () => {
    const db = databaseRef.current;
    const connector = connectorRef.current;
    if (!db || !connector) {
      throw new Error("Offline database is not ready");
    }
    let uploaded = false;
    for (let i = 0; i < 50; i++) {
      const pending = await db.getCrudBatch();
      if (!pending) return uploaded;
      await connector.uploadData(db);
      uploaded = true;
    }
    return uploaded;
  }, []);

  const createMetadata = useCallback(
    async (
      table: SyncedMetadataTable,
      values: Record<string, unknown>,
      id?: string,
    ) => {
      const db = databaseRef.current;
      if (!db) throw new Error("Offline database is not ready");
      const rowId = id ?? crypto.randomUUID().replace(/-/g, "");
      const now = new Date().toISOString();
      const complete = {
        ...values,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      const entries = Object.entries(complete);
      const columns = entries.map(([key]) => {
        if (!/^[a-z_]+$/.test(key)) throw new Error("Invalid metadata field");
        return key;
      });
      await db.execute(
        `INSERT INTO ${table} (id, ${columns.join(", ")}) VALUES (?, ${columns
          .map(() => "?")
          .join(", ")})`,
        [rowId, ...entries.map(([, value]) => value)],
      );
      return rowId;
    },
    [],
  );

  const status = database?.currentStatus;
  const ready = Boolean(database?.ready);
  const connected = status?.connected ?? false;
  const connecting = status?.connecting ?? false;
  const hasSynced = Boolean(status?.lastSyncedAt);
  const downloadErrorMessage =
    status?.dataFlowStatus.downloadError?.message ?? null;
  const uploadErrorMessage =
    status?.dataFlowStatus.uploadError?.message ?? null;
  // Keep the first lastSyncedAt so checkpoint ticks do not replace the context
  // object and re-render every workspace action consumer.
  const lastSyncedAtFrozenRef = useRef<Date | null>(null);
  if (status?.lastSyncedAt && !lastSyncedAtFrozenRef.current) {
    lastSyncedAtFrozenRef.current = status.lastSyncedAt;
  }
  const stableValueRef = useRef<SyncState | null>(null);

  const value = useMemo<SyncState>(() => {
    let syncStatus: PowerSyncStatus;
    let message: string;
    if (initError) {
      syncStatus = "error";
      message = `PowerSync unavailable (${initError.message})`;
    } else if (!database || connecting) {
      syncStatus = "connecting";
      message = "Connecting PowerSync…";
    } else if (ready) {
      syncStatus = "ready";
      message = "PowerSync ready";
    } else {
      syncStatus = "error";
      message = "PowerSync not ready";
    }

    const next: SyncState = {
      status: syncStatus,
      message,
      database,
      connected,
      connecting,
      ready,
      offline,
      lastSyncedAt: lastSyncedAtFrozenRef.current,
      error: initError,
      retry,
      createMetadata,
      patchMetadata,
      flushCrudUpload,
    };
    const prev = stableValueRef.current;
    if (
      prev &&
      prev.status === next.status &&
      prev.message === next.message &&
      prev.database === next.database &&
      prev.connected === next.connected &&
      prev.connecting === next.connecting &&
      prev.ready === next.ready &&
      prev.offline === next.offline &&
      prev.lastSyncedAt === next.lastSyncedAt &&
      prev.error === next.error &&
      prev.retry === next.retry &&
      prev.createMetadata === next.createMetadata &&
      prev.patchMetadata === next.patchMetadata &&
      prev.flushCrudUpload === next.flushCrudUpload
    ) {
      return prev;
    }
    stableValueRef.current = next;
    return next;
  }, [
    connected,
    connecting,
    createMetadata,
    database,
    downloadErrorMessage,
    flushCrudUpload,
    initError,
    offline,
    patchMetadata,
    ready,
    retry,
    uploadErrorMessage,
    hasSynced,
  ]);

  return (
    <PowerSyncContext.Provider value={value}>{children}</PowerSyncContext.Provider>
  );
}

/**
 * PowerSync for the local-shell desktop.
 */
export function PowerSyncProvider({
  children,
  authenticated,
  apiUrl,
}: {
  children: ReactNode;
  authenticated: boolean;
  apiUrl: string;
}) {
  if (!authenticated) {
    return (
      <UnauthenticatedPowerSyncProvider>{children}</UnauthenticatedPowerSyncProvider>
    );
  }

  return (
    <AuthenticatedPowerSyncProvider apiUrl={apiUrl}>
      {children}
    </AuthenticatedPowerSyncProvider>
  );
}

export function useDesktopPowerSync() {
  return useContext(PowerSyncContext);
}

function rowsUnchanged(
  previous: readonly unknown[],
  next: readonly unknown[],
): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  for (let i = 0; i < previous.length; i += 1) {
    if (previous[i] !== next[i]) return false;
  }
  return true;
}

/** Default comparator: key by `id` when present; compare via JSON. */
export function defaultPowerSyncRowComparator<T>(item: T): {
  key: string;
  compare: string;
} {
  const record = item as { id?: unknown };
  const key =
    typeof record.id === "string" || typeof record.id === "number"
      ? String(record.id)
      : JSON.stringify(item);
  return { key, compare: JSON.stringify(item) };
}

/**
 * Watched PowerSync query with incremental `differentialWatch` so React only
 * sees a new `data` reference when the result set actually changes, and
 * unchanged row object references are preserved.
 */
export function usePowerSyncQuery<T>(
  sql: string | null,
  parameters: unknown[] = [],
  options?: {
    rowComparator?: PowerSyncRowComparator<T>;
  },
) {
  const { database } = useDesktopPowerSync();
  const parameterKey = JSON.stringify(parameters);
  const queryKey = `${sql ?? ""}\0${parameterKey}`;
  const [result, setResult] = useState<{
    database: PowerSyncDatabase;
    queryKey: string;
    rows: T[];
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    database: PowerSyncDatabase;
    queryKey: string;
    error: Error;
  } | null>(null);
  const rowComparator = options?.rowComparator;
  const rowComparatorRef = useRef(rowComparator);
  rowComparatorRef.current = rowComparator;

  useEffect(() => {
    if (!database || !sql) return;

    const comparator: PowerSyncRowComparator<T> = rowComparatorRef.current ?? {
      keyBy: (item) => defaultPowerSyncRowComparator(item).key,
      compareBy: (item) => defaultPowerSyncRowComparator(item).compare,
    };

    const watched = database
      .query({
        sql,
        parameters: parameters as ReadonlyArray<
          string | number | boolean | null | undefined
        >,
      })
      .differentialWatch({
        throttleMs: 32,
        // Avoid extra React commits from isFetching flips when only data matters.
        reportFetching: false,
        rowComparator: comparator as {
          keyBy: (item: unknown) => string;
          compareBy: (item: unknown) => string;
        },
      });

    const applyState = () => {
      const { data: rows, error: watchError } = watched.state;
      if (watchError) {
        setErrorState({
          database,
          queryKey,
          error: watchError,
        });
        return;
      }
      setResult((current) => {
        if (
          current &&
          current.database === database &&
          current.queryKey === queryKey &&
          rowsUnchanged(current.rows, rows)
        ) {
          return current;
        }
        return {
          database,
          queryKey,
          rows: [...rows] as T[],
        };
      });
      setErrorState(null);
    };

    const unsubscribe = watched.registerListener({
      onData: () => applyState(),
      // Empty result sets match the [] placeholder, so differentialWatch may
      // flip isLoading without emitting onData — still treat that as ready.
      onStateChange: (state) => {
        if (!state.isLoading) {
          applyState();
        }
      },
      onError: (watchError) => {
        setErrorState({
          database,
          queryKey,
          error: watchError,
        });
      },
    });

    // Seed after subscribe so a fast first emit cannot race past the listener.
    if (!watched.state.isLoading) {
      applyState();
    }

    return () => {
      unsubscribe();
      void watched.close();
    };
    // parameters are keyed by their serialized stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, parameterKey, sql]);

  const data =
    result?.database === database && result.queryKey === queryKey
      ? result.rows
      : null;
  const error =
    errorState?.database === database && errorState.queryKey === queryKey
      ? errorState.error
      : null;
  return {
    data,
    error,
    loading: Boolean(sql) && Boolean(database) && data === null && !error,
  };
}
