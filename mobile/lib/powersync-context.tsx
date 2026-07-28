import { useAuth } from "@clerk/clerk-expo";
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

import { getMobileEnvironment } from "./env";
import { getOrCreateDeviceId } from "./device-id";
import {
  BacksterPowerSyncConnector,
  createPowerSyncDatabase,
  isNativeSqliteThreadError,
} from "./powersync";

/** Keep in sync with `use-rest-fallback-gate` export. */
const REST_FALLBACK_DELAY_MS = 4500;

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
  lastSyncedAt: Date | null;
  /**
   * App-wide: empty local DB may use REST after the fallback delay (or on
   * hard error). Shared so each screen does not restart its own 4.5s wait.
   */
  restFallbackAllowed: boolean;
  patchTask: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchProject: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchLetter: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchDocument: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchContact: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchOrganization: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
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
  const { isLoaded, userId, sessionId, getToken } = useAuth();
  const { apiUrl } = getMobileEnvironment();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  // Clerk session id string can churn; only react to presence.
  const hasSession = Boolean(sessionId);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

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
  const identityRef = useRef<string | null>(null);
  /** Serialize open/close — overlapping OP-SQLite opens exhaust device threads. */
  const transitionRef = useRef(Promise.resolve());
  const lastRetryAtRef = useRef(0);
  const generationRef = useRef(0);

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
    if (!isLoaded || !userId || !hasSession) return;

    let cancelled = false;
    const generation = ++generationRef.current;
    const userChanged =
      identityRef.current !== null && identityRef.current !== userId;

    if (userChanged) {
      setDatabase(null);
      setInitError(null);
      setRestFallbackAllowed(false);
      setSyncFlags({
        hasSynced: false,
        connected: false,
        connecting: false,
        lastSyncedAtMs: null,
      });
    }

    console.info(
      `[mobile] PowerSync init start (gen=${generation}, nonce=${reconnectNonce})`,
    );

    transitionRef.current = transitionRef.current.then(async () => {
      if (cancelled || generation !== generationRef.current) return;

      const previous = databaseRef.current;
      databaseRef.current = null;
      if (previous) {
        await closeDatabase(previous, userChanged);
      }
      if (cancelled || generation !== generationRef.current) return;

      if (!sessionIdRef.current) {
        identityRef.current = null;
        setDatabase(null);
        setInitError(null);
        return;
      }

      identityRef.current = userId;

      const openAndConnect = async (forceSqlJs: boolean) => {
        const deviceId = await getOrCreateDeviceId();
        if (cancelled || generation !== generationRef.current) return null;

        const next = createPowerSyncDatabase(userId, { forceSqlJs });
        const connector = new BacksterPowerSyncConnector(
          apiUrl,
          async () => {
            try {
              const token = await getTokenRef.current({ skipCache: true });
              if (typeof token === "string" && token.trim()) return token.trim();
            } catch {
              /* retry loop in connector */
            }
            return null;
          },
          deviceId,
        );
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
    };
    // sessionId string intentionally omitted — only hasSession (boolean).
    // getToken omitted — Clerk often returns a new function identity each render.
  }, [apiUrl, hasSession, isLoaded, reconnectNonce, userId]);

  const retry = useCallback(async () => {
    const now = Date.now();
    if (now - lastRetryAtRef.current < 4_000) return;
    lastRetryAtRef.current = now;
    setInitError(null);
    setReconnectNonce((n) => n + 1);
  }, []);

  const patchRow = useCallback(
    async (
      table:
        | "tasks"
        | "projects"
        | "letters"
        | "documents"
        | "contacts"
        | "organizations",
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
    if (!isLoaded || !userId || !sessionId) {
      setRestFallbackAllowed(false);
      return;
    }
    const timer = setTimeout(() => {
      setRestFallbackAllowed(true);
    }, REST_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [initError, isLoaded, ready, sessionId, userId]);

  const value = useMemo<SyncState>(() => {
    let syncStatus: PowerSyncStatus = "idle";
    let message = "PowerSync idle";
    const errorHint = initError
      ? initError.message.replace(/\s+/g, " ").slice(0, 120)
      : null;
    if (!isLoaded) {
      syncStatus = "connecting";
      message = "Loading session…";
    } else if (!userId || !sessionId) {
      syncStatus = "unauthenticated";
      message = "Sign in to sync";
    } else if (!ready && initError) {
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
      patchTask,
      patchProject,
      patchLetter,
      patchDocument,
      patchContact,
      patchOrganization,
      retry,
    };
  }, [
    database,
    initError,
    isLoaded,
    patchContact,
    patchDocument,
    patchLetter,
    patchOrganization,
    patchProject,
    patchTask,
    ready,
    restFallbackAllowed,
    retry,
    sessionId,
    sqliteReady,
    syncFlags.connected,
    syncFlags.connecting,
    syncFlags.hasSynced,
    syncFlags.lastSyncedAtMs,
    userId,
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
  const { isSignedIn } = useAuth();
  if (!isSignedIn) {
    return (
      <MobileSyncContext.Provider
        value={{
          ...idleState,
          status: "unauthenticated",
          message: "Sign in to sync",
        }}
      >
        {children}
      </MobileSyncContext.Provider>
    );
  }
  return (
    <AuthenticatedPowerSyncProvider>{children}</AuthenticatedPowerSyncProvider>
  );
}

export function useMobilePowerSync() {
  return useContext(MobileSyncContext);
}
