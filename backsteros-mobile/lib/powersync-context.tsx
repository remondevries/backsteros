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
} from "./powersync";

type PowerSyncStatus =
  | "idle"
  | "unauthenticated"
  | "connecting"
  | "ready"
  | "error"
  | "rest-only";

type SyncState = {
  status: PowerSyncStatus;
  message: string;
  database: PowerSyncDatabase | null;
  ready: boolean;
  connected: boolean;
  connecting: boolean;
  lastSyncedAt: Date | null;
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

function AuthenticatedPowerSyncProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId, sessionId, getToken } = useAuth();
  const { apiUrl } = getMobileEnvironment();
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
  const databaseRef = useRef<PowerSyncDatabase | null>(null);
  const identityRef = useRef<string | null>(null);

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
    if (!isLoaded) return;
    let cancelled = false;
    const userChanged = identityRef.current !== null && identityRef.current !== userId;

    void (async () => {
      const previous = databaseRef.current;
      databaseRef.current = null;
      if (previous) {
        try {
          if (userChanged) {
            await previous.disconnectAndClear();
          } else {
            await previous.disconnect();
          }
          await previous.close({ disconnect: true });
        } catch {
          /* ignore */
        }
      }
      if (cancelled || !userId || !sessionId) {
        if (!cancelled) {
          identityRef.current = null;
          setDatabase(null);
          setInitError(null);
        }
        return;
      }

      identityRef.current = userId;

      try {
        const deviceId = await getOrCreateDeviceId();
        const next = createPowerSyncDatabase(userId);
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
        databaseRef.current = next;
        const dispose = next.registerListener({
          statusChanged: (nextStatus) => {
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
          await next.connect(connector);
          await next.waitForReady();
          if (!cancelled) {
            setInitError(null);
            setSyncFlags(flagsFromStatus(next.currentStatus));
          }
        } catch (reason) {
          const error =
            reason instanceof Error
              ? reason
              : new Error("PowerSync connect failed");
          console.warn(
            "[mobile] PowerSync connect failed — REST lists still available",
            error,
          );
          if (!cancelled) setInitError(error);
        }
        // Publish the DB even when connect fails so a prior hasSynced cache
        // can still serve offline lists; screens use REST until hasSynced.
        if (!cancelled) setDatabase(next);
        if (cancelled) dispose();
      } catch (reason) {
        if (!cancelled) {
          setDatabase(null);
          setInitError(
            reason instanceof Error
              ? reason
              : new Error("PowerSync SQLite init failed"),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, isLoaded, reconnectNonce, sessionId, userId]);

  const retry = useCallback(async () => {
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
  // Otherwise connect can open an empty SQLite DB and screens skip REST.
  const hasSynced = syncFlags.hasSynced;
  const ready = sqliteReady && hasSynced;
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
      syncStatus = "rest-only";
      message = errorHint
        ? `PowerSync unavailable (${errorHint}) — REST fallback`
        : "PowerSync unavailable — REST fallback";
    } else if (!database || (!ready && syncFlags.connecting)) {
      syncStatus = "connecting";
      message = "Connecting…";
    } else if (ready) {
      syncStatus = "ready";
      message = syncFlags.connected ? "Synced" : "Local (offline)";
    } else if (!ready && sqliteReady) {
      syncStatus = "connecting";
      message = "Syncing…";
    } else {
      syncStatus = "error";
      message = "Not ready";
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
