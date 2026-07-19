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
  patchTask: (id: string, values: Record<string, unknown>) => Promise<void>;
  retry: () => Promise<void>;
};

const idleState: SyncState = {
  status: "idle",
  message: "PowerSync idle",
  database: null,
  ready: false,
  connected: false,
  patchTask: async () => {
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
  const [, setStatusVersion] = useState(0);
  const databaseRef = useRef<PowerSyncDatabase | null>(null);
  const identityRef = useRef<string | null>(null);

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
          statusChanged: () => setStatusVersion((v) => v + 1),
        });
        if (!cancelled) setDatabase(next);
        try {
          await next.connect(connector);
          await next.waitForReady();
          if (!cancelled) setInitError(null);
        } catch (reason) {
          if (!cancelled) {
            setInitError(
              reason instanceof Error
                ? reason
                : new Error("PowerSync connect failed"),
            );
          }
        }
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

  const patchTask = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      const db = databaseRef.current;
      if (!db) throw new Error("Offline database is not ready");
      const entries = Object.entries(values);
      if (!entries.length) return;
      const columns = entries.map(([key]) => {
        if (!/^[a-z_]+$/.test(key)) throw new Error("Invalid field");
        return `${key} = ?`;
      });
      await db.execute(
        `UPDATE tasks SET ${columns.join(", ")}, updated_at = ? WHERE id = ?`,
        [...entries.map(([, value]) => value), new Date().toISOString(), id],
      );
    },
    [],
  );

  const status = database?.currentStatus;
  const ready = Boolean(database?.ready);
  const value = useMemo<SyncState>(() => {
    let syncStatus: PowerSyncStatus = "idle";
    let message = "PowerSync idle";
    if (!isLoaded) {
      syncStatus = "connecting";
      message = "Loading session…";
    } else if (!userId || !sessionId) {
      syncStatus = "unauthenticated";
      message = "Sign in to sync";
    } else if (initError && !database) {
      syncStatus = "rest-only";
      message = `PowerSync unavailable — REST fallback`;
    } else if (!database || status?.connecting) {
      syncStatus = "connecting";
      message = "Connecting…";
    } else if (ready) {
      syncStatus = "ready";
      message = status?.connected ? "Synced" : "Local (offline)";
    } else if (initError) {
      syncStatus = "rest-only";
      message = "REST fallback";
    } else {
      syncStatus = "error";
      message = "Not ready";
    }

    return {
      status: syncStatus,
      message,
      database,
      ready,
      connected: status?.connected ?? false,
      patchTask,
      retry,
    };
  }, [
    database,
    initError,
    isLoaded,
    patchTask,
    ready,
    retry,
    sessionId,
    status,
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
