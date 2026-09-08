import { PowerSyncContext } from "@powersync/react-native";
import type { PowerSyncDatabase } from "@powersync/react-native";
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

import { useMobileCoreApiUrl } from "./api-url-context";
import { getOrCreateDeviceId } from "./device-id";
import {
  createMobileTokenProvider,
  LOCAL_SHELL_USER_ID,
} from "./local-shell-auth";
import {
  BacksterPowerSyncConnector,
  createPowerSyncDatabase,
  isNativeSqliteThreadError,
} from "./powersync";
import { randomUuidCompact } from "./random-uuid";

/** Keep in sync with `use-rest-fallback-gate` export. */
const REST_FALLBACK_DELAY_MS = 4500;

type PowerSyncStatus =
  | "idle"
  | "unauthenticated"
  | "connecting"
  | "ready"
  | "error";

/** Tier A/B tables that support local PATCH + PowerSync upload. */
export type SyncedMetadataTable =
  | "tasks"
  | "projects"
  | "letters"
  | "documents"
  | "contacts"
  | "organizations"
  | "habits"
  | "areas"
  | "bank_accounts"
  | "financial_categories"
  | "financial_goals"
  | "financial_recurrings"
  | "cashflow_planner_entries"
  | "meetings"
  | "workspace_settings"
  | "task_comments"
  | "contact_relationships"
  | "crm_relationship_labels"
  | "crm_groups"
  | "crm_group_members"
  | "crm_activities";

type SyncState = {
  status: PowerSyncStatus;
  message: string;
  database: PowerSyncDatabase | null;
  ready: boolean;
  connected: boolean;
  connecting: boolean;
  lastSyncedAt: Date | null;
  /**
   * App-wide: empty local DB may use REST after the fallback delay (or on
   * hard error). Shared so each screen does not restart its own 4.5s wait.
   */
  restFallbackAllowed: boolean;
  /**
   * When local-core is unreachable, REST targets cloud-core while PowerSync
   * still aims at local. Skip PowerSync entity writes so we do not diverge.
   */
  preferRestWrites: boolean;
  patchTask: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchProject: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchLetter: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchDocument: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchContact: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchOrganization: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  patchHabit: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchArea: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchMeeting: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchMetadata: (
    table: SyncedMetadataTable,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  createMetadata: (
    table: SyncedMetadataTable,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  /** @returns true if at least one CRUD batch was uploaded */
  flushCrudUpload: () => Promise<boolean>;
  retry: () => Promise<void>;
};

const idleState: SyncState = {
  status: "idle",
  message: "PowerSync idle",
  database: null,
  ready: false,
  connected: false,
  connecting: false,
  lastSyncedAt: null,
  restFallbackAllowed: false,
  preferRestWrites: false,
  patchTask: async () => {
    throw new Error("Offline database is not ready");
  },
  patchProject: async () => {
    throw new Error("Offline database is not ready");
  },
  patchLetter: async () => {
    throw new Error("Offline database is not ready");
  },
  patchDocument: async () => {
    throw new Error("Offline database is not ready");
  },
  patchContact: async () => {
    throw new Error("Offline database is not ready");
  },
  patchOrganization: async () => {
    throw new Error("Offline database is not ready");
  },
  patchHabit: async () => {
    throw new Error("Offline database is not ready");
  },
  patchArea: async () => {
    throw new Error("Offline database is not ready");
  },
  patchMeeting: async () => {
    throw new Error("Offline database is not ready");
  },
  patchMetadata: async () => {
    throw new Error("Offline database is not ready");
  },
  createMetadata: async () => {
    throw new Error("Offline database is not ready");
  },
  flushCrudUpload: async () => {
    throw new Error("Offline database is not ready");
  },
  retry: async () => {},
};

const MobileSyncContext = createContext<SyncState>(idleState);

async function closeDatabase(
  db: PowerSyncDatabase,
  clearData: boolean,
): Promise<void> {
  try {
    if (clearData) {
      await db.disconnectAndClear();
    } else {
      await db.disconnect();
    }
    await db.close({ disconnect: true });
  } catch {
    /* ignore close races */
  }
}

function AuthenticatedPowerSyncProvider({ children }: { children: ReactNode }) {
  const userId = LOCAL_SHELL_USER_ID;
  const { localApiUrl, coreMode } = useMobileCoreApiUrl();
  const preferRestWrites = coreMode === "cloud";
  const getToken = useMemo(() => createMobileTokenProvider(), []);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [database, setDatabase] = useState<PowerSyncDatabase | null>(null);
  const [initError, setInitError] = useState<Error | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  /** Only meaningful sync flags — avoid re-rendering on every status tick. */
  const [syncFlags, setSyncFlags] = useState({
    hasSynced: false,
    connected: false,
    connecting: false,
    lastSyncedAtMs: null as number | null,
  });
  const [restFallbackAllowed, setRestFallbackAllowed] = useState(false);
  const databaseRef = useRef<PowerSyncDatabase | null>(null);
  const connectorRef = useRef<BacksterPowerSyncConnector | null>(null);
  const identityRef = useRef<string | null>(null);
  /** Serialize open/close — overlapping OP-SQLite opens exhaust device threads. */
  const transitionRef = useRef(Promise.resolve());
  const lastRetryAtRef = useRef(0);
  const generationRef = useRef(0);
  /** Circuit breaker: limit full reconnect storms within a rolling window. */
  const reconnectWindowRef = useRef({ startedAt: 0, count: 0 });

  function flagsFromStatus(nextStatus: {
    hasSynced?: boolean | null;
    connected?: boolean | null;
    connecting?: boolean | null;
    lastSyncedAt?: Date | null;
  }) {
    return {
      hasSynced: Boolean(nextStatus.hasSynced),
      connected: Boolean(nextStatus.connected),
      connecting: Boolean(nextStatus.connecting),
      lastSyncedAtMs: nextStatus.lastSyncedAt
        ? nextStatus.lastSyncedAt.getTime()
        : null,
    };
  }

  useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;
    const userChanged =
      identityRef.current !== null && identityRef.current !== userId;

    // Always drop the React DB handle before closing native SQLite. Screens hold
    // live `watch()` subscriptions via `useLocalQuery`; closing while they still
    // see a truthy `database` is a use-after-close native crash path.
    setDatabase(null);
    if (userChanged) {
      setInitError(null);
      setRestFallbackAllowed(false);
      setSyncFlags({
        hasSynced: false,
        connected: false,
        connecting: false,
        lastSyncedAtMs: null,
      });
    } else {
      setSyncFlags((prev) => ({
        ...prev,
        connected: false,
        connecting: true,
      }));
    }

    console.info(
      `[mobile] PowerSync init start (gen=${generation}, nonce=${reconnectNonce})`,
    );

    transitionRef.current = transitionRef.current.then(async () => {
      if (cancelled || generation !== generationRef.current) return;

      // Yield a frame so watch effects observe `database === null` and abort
      // before OP-SQLite teardown.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      if (cancelled || generation !== generationRef.current) return;

      const previous = databaseRef.current;
      databaseRef.current = null;
      connectorRef.current = null;
      if (previous) {
        await closeDatabase(previous, userChanged);
      }
      if (cancelled || generation !== generationRef.current) return;

      identityRef.current = userId;

      const openAndConnect = async (forceSqlJs: boolean) => {
        const deviceId = await getOrCreateDeviceId();
        if (cancelled || generation !== generationRef.current) return null;

        const next = createPowerSyncDatabase(userId, { forceSqlJs });
        const connector = new BacksterPowerSyncConnector(
          localApiUrl,
          async () => {
            try {
              const token = await getTokenRef.current();
              if (typeof token === "string" && token.trim()) return token.trim();
            } catch {
              /* retry loop in connector */
            }
            return null;
          },
          deviceId,
        );
        connectorRef.current = connector;
        const dispose = next.registerListener({
          statusChanged: (nextStatus) => {
            if (generation !== generationRef.current) return;
            setSyncFlags((prev) => {
              const nextFlags = flagsFromStatus(nextStatus);
              if (
                prev.hasSynced === nextFlags.hasSynced &&
                prev.connected === nextFlags.connected &&
                prev.connecting === nextFlags.connecting &&
                prev.lastSyncedAtMs === nextFlags.lastSyncedAtMs
              ) {
                return prev;
              }
              return nextFlags;
            });
          },
        });

        try {
          // Open SQLite first so cached rows are readable immediately. Sync
          // connect can be slow/fail on device — never gate local reads on it.
          await next.waitForReady();
          if (cancelled || generation !== generationRef.current) {
            dispose();
            await closeDatabase(next, false);
            return null;
          }

          databaseRef.current = next;
          setInitError(null);
          setSyncFlags(flagsFromStatus(next.currentStatus));
          setDatabase(next);
          console.info(
            `[mobile] PowerSync local DB ready (${forceSqlJs ? "sqljs" : "op-sqlite"})`,
          );

          try {
            await next.connect(connector);
            if (cancelled || generation !== generationRef.current) {
              return next;
            }
            setInitError(null);
            setSyncFlags(flagsFromStatus(next.currentStatus));
            console.info(
              `[mobile] PowerSync connected (${forceSqlJs ? "sqljs" : "op-sqlite"})`,
            );
            try {
              for (let i = 0; i < 50; i++) {
                const pending = await next.getCrudBatch();
                if (!pending) break;
                await connector.uploadData(next);
              }
            } catch (flushReason) {
              console.warn(
                "[mobile] PowerSync post-connect CRUD flush failed",
                flushReason,
              );
            }
            return next;
          } catch (connectReason) {
            // Keep the local DB (desktop parity). REST fallback is only needed
            // when there is no prior sync cache to read from.
            const hasLocalCache = Boolean(next.currentStatus.hasSynced);
            console.warn(
              hasLocalCache
                ? "[mobile] PowerSync sync connect failed; serving cached SQLite"
                : "[mobile] PowerSync sync connect failed; no local cache yet",
              connectReason,
            );
            if (!cancelled && generation === generationRef.current) {
              if (!hasLocalCache) {
                setInitError(
                  connectReason instanceof Error
                    ? connectReason
                    : new Error("PowerSync connect failed"),
                );
              }
              setSyncFlags(flagsFromStatus(next.currentStatus));
            }
            return next;
          }
        } catch (openReason) {
          dispose();
          await closeDatabase(next, false);
          throw openReason;
        }
      };

      try {
        await openAndConnect(false);
      } catch (reason) {
        if (cancelled || generation !== generationRef.current) return;

        // Only swap adapters when *opening* SQLite fails — never after a
        // working OP-SQLite DB is already serving cached rows.
        if (isNativeSqliteThreadError(reason)) {
          console.warn(
            "[mobile] OP-SQLite thread exhausted — falling back to SQL.js once",
            reason,
          );
          try {
            await openAndConnect(true);
            return;
          } catch (sqlJsReason) {
            const error =
              sqlJsReason instanceof Error
                ? sqlJsReason
                : new Error("PowerSync SQL.js open failed");
            console.warn("[mobile] PowerSync SQL.js fallback failed", error);
            setDatabase(null);
            setInitError(error);
            return;
          }
        }

        const error =
          reason instanceof Error
            ? reason
            : new Error("PowerSync open failed");
        console.warn("[mobile] PowerSync open failed", error);
        setDatabase(null);
        setInitError(error);
      }
    });

    return () => {
      cancelled = true;
      // Drop the React handle immediately so watches abort; native close is
      // serialized on the transition queue (next effect or idle close below).
      setDatabase(null);
      const closing = databaseRef.current;
      databaseRef.current = null;
      connectorRef.current = null;
      if (closing) {
        transitionRef.current = transitionRef.current.then(async () => {
          await closeDatabase(closing, false);
        });
      }
    };
    // Token provider is stable (local-shell); do not depend on its identity.
  }, [localApiUrl, reconnectNonce, userId]);

  const retry = useCallback(async () => {
    const now = Date.now();
    if (now - lastRetryAtRef.current < 4_000) return;
    const window = reconnectWindowRef.current;
    if (now - window.startedAt > 60_000) {
      reconnectWindowRef.current = { startedAt: now, count: 0 };
    }
    if (reconnectWindowRef.current.count >= 4) {
      console.warn(
        "[mobile] PowerSync reconnect circuit open — serving cache / REST until window resets",
      );
      return;
    }
    reconnectWindowRef.current.count += 1;
    lastRetryAtRef.current = now;
    setInitError(null);
    setReconnectNonce((n) => n + 1);
  }, []);

  const patchRow = useCallback(
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
        if (!/^[a-z_]+$/.test(key)) throw new Error("Invalid field");
        return `${key} = ?`;
      });
      await db.execute(
        `UPDATE ${table} SET ${columns.join(", ")}, updated_at = ? WHERE id = ?`,
        [...entries.map(([, value]) => value), new Date().toISOString(), id],
      );
    },
    [],
  );

  const patchTask = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("tasks", id, values),
    [patchRow],
  );

  const patchProject = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("projects", id, values),
    [patchRow],
  );

  const patchLetter = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("letters", id, values),
    [patchRow],
  );

  const patchDocument = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("documents", id, values),
    [patchRow],
  );

  const patchContact = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("contacts", id, values),
    [patchRow],
  );

  const patchOrganization = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("organizations", id, values),
    [patchRow],
  );

  const patchHabit = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("habits", id, values),
    [patchRow],
  );

  const patchArea = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("areas", id, values),
    [patchRow],
  );

  const patchMeeting = useCallback(
    (id: string, values: Record<string, unknown>) =>
      patchRow("meetings", id, values),
    [patchRow],
  );

  const patchMetadata = useCallback(
    (table: SyncedMetadataTable, id: string, values: Record<string, unknown>) =>
      patchRow(table, id, values),
    [patchRow],
  );

  const createMetadata = useCallback(
    async (
      table: SyncedMetadataTable,
      values: Record<string, unknown>,
      id?: string,
    ) => {
      const db = databaseRef.current;
      if (!db) throw new Error("Offline database is not ready");
      const rowId = id ?? randomUuidCompact();
      const now = new Date().toISOString();
      const complete = {
        ...values,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      const entries = Object.entries(complete).filter(
        ([, value]) => value !== undefined,
      );
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

  const flushCrudUpload = useCallback(async () => {
    const db = databaseRef.current;
    const connector = connectorRef.current;
    if (!db || !connector) {
      throw new Error("Offline database is not ready");
    }
    // Drain the queue (SDK auto-upload also loops; one-shot flush is not enough
    // when several CRUD rows are pending).
    let uploaded = false;
    for (let i = 0; i < 50; i++) {
      const pending = await db.getCrudBatch();
      if (!pending) return uploaded;
      await connector.uploadData(db);
      uploaded = true;
    }
    return uploaded;
  }, []);

  const sqliteReady = Boolean(database?.ready);
  // Only trust local rows after PowerSync has completed at least one sync.
  // Otherwise connect can open an empty SQLite DB before data arrives.
  const hasSynced = syncFlags.hasSynced;
  const ready = sqliteReady && hasSynced;

  // Single app-wide REST fallback timer — screens used to each restart a 4.5s
  // wait on mount, which felt like a spinner on every navigation.
  useEffect(() => {
    if (ready) {
      setRestFallbackAllowed(false);
      return;
    }
    if (initError) {
      setRestFallbackAllowed(true);
      return;
    }
    const timer = setTimeout(() => {
      setRestFallbackAllowed(true);
    }, REST_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [initError, ready]);

  const value = useMemo<SyncState>(() => {
    let syncStatus: PowerSyncStatus = "idle";
    let message = "PowerSync idle";
    const errorHint = initError
      ? initError.message.replace(/\s+/g, " ").slice(0, 120)
      : null;
    if (!ready && initError) {
      syncStatus = "error";
      message = errorHint
        ? `PowerSync unavailable (${errorHint})`
        : "PowerSync unavailable";
    } else if (!database || (!ready && syncFlags.connecting)) {
      syncStatus = "connecting";
      message = "Connecting…";
    } else if (ready) {
      syncStatus = "ready";
      message = syncFlags.connected ? "Synced" : "Local (offline)";
    } else {
      // DB opening, first sync, or brief gaps — never surface as a hard error.
      syncStatus = "connecting";
      message = sqliteReady ? "Syncing…" : "Connecting…";
    }

    return {
      status: syncStatus,
      message,
      database,
      ready,
      connected: syncFlags.connected,
      connecting: syncFlags.connecting,
      lastSyncedAt:
        syncFlags.lastSyncedAtMs != null
          ? new Date(syncFlags.lastSyncedAtMs)
          : null,
      restFallbackAllowed:
        syncStatus === "error" ? true : restFallbackAllowed,
      preferRestWrites,
      patchTask,
      patchProject,
      patchLetter,
      patchDocument,
      patchContact,
      patchOrganization,
      patchHabit,
      patchArea,
      patchMeeting,
      patchMetadata,
      createMetadata,
      flushCrudUpload,
      retry,
    };
  }, [
    createMetadata,
    database,
    flushCrudUpload,
    initError,
    patchContact,
    patchDocument,
    patchHabit,
    patchArea,
    patchMeeting,
    patchMetadata,
    patchLetter,
    patchOrganization,
    patchProject,
    patchTask,
    preferRestWrites,
    ready,
    restFallbackAllowed,
    retry,
    sqliteReady,
    syncFlags.connected,
    syncFlags.connecting,
    syncFlags.hasSynced,
    syncFlags.lastSyncedAtMs,
  ]);

  if (!database) {
    return (
      <MobileSyncContext.Provider value={value}>
        {children}
      </MobileSyncContext.Provider>
    );
  }

  return (
    <PowerSyncContext.Provider value={database}>
      <MobileSyncContext.Provider value={value}>
        {children}
      </MobileSyncContext.Provider>
    </PowerSyncContext.Provider>
  );
}

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedPowerSyncProvider>{children}</AuthenticatedPowerSyncProvider>
  );
}

export function useMobilePowerSync() {
  return useContext(MobileSyncContext);
}
