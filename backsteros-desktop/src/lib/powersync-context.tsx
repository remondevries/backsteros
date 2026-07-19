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
import { useAuth } from "@clerk/clerk-react";
import type { PowerSyncDatabase } from "@powersync/web";

import {
  BacksterPowerSyncConnector,
  createPowerSyncDatabase,
} from "./powersync";
import type { BackendMode } from "./backend-mode";
import { useDesktopApi } from "./api-context";

export const SYNCED_METADATA_TABLES = [
  "projects",
  "tasks",
  "documents",
  "organizations",
  "contacts",
  "letters",
  "workspace_settings",
] as const;

export type SyncedMetadataTable = (typeof SYNCED_METADATA_TABLES)[number];

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

function syncError(database: PowerSyncDatabase): Error | null {
  return (
    database.currentStatus.dataFlowStatus.downloadError ??
    database.currentStatus.dataFlowStatus.uploadError ??
    null
  );
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
      message: "Sign in to enable PowerSync",
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
  backendMode,
  children,
}: {
  apiUrl: string;
  backendMode: BackendMode;
  children: ReactNode;
}) {
  const { isLoaded, userId, sessionId, getToken } = useAuth();
  const { client } = useDesktopApi();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const clientRef = useRef(client);
  clientRef.current = client;

  const [databaseState, setDatabaseState] = useState<{
    userId: string;
    database: PowerSyncDatabase;
  } | null>(null);
  const database =
    sessionId && databaseState?.userId === userId
      ? databaseState.database
      : null;
  const [offline, setOffline] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [, setStatusVersion] = useState(0);
  const databaseRef = useRef<PowerSyncDatabase | null>(null);
  const connectorRef = useRef<BacksterPowerSyncConnector | null>(null);
  const transitionRef = useRef(Promise.resolve());
  const identityRef = useRef<{ userId: string | null; mode: BackendMode }>({
    userId: null,
    mode: backendMode,
  });

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
    if (!isLoaded) return;
    let cancelled = false;
    const userChanged = identityRef.current.userId !== userId;
    const modeChanged = identityRef.current.mode !== backendMode;
    // Drop the live DB handle immediately so UI does not keep serving the
    // previous backend while the next PowerSync instance is connecting.
    if (userChanged || modeChanged) {
      setDatabaseState(null);
      setInitError(null);
    }

    transitionRef.current = transitionRef.current.then(async () => {
      const previous = databaseRef.current;
      databaseRef.current = null;
      connectorRef.current = null;
      if (previous) {
        try {
          // Separate SQLite files per mode — only wipe when the user changes.
          if (userChanged) {
            await previous.disconnectAndClear();
          } else {
            await previous.disconnect();
          }
          await previous.close({ disconnect: true });
        } catch {
          /* ignore close races */
        }
      }
      if (cancelled || !userId || !sessionId) {
        if (!cancelled) {
          setDatabaseState(null);
          setInitError(null);
        }
        return;
      }

      identityRef.current = { userId, mode: backendMode };

      try {
        const next = createPowerSyncDatabase(userId, backendMode);
        const connector = new BacksterPowerSyncConnector(
          apiUrl,
          async () => {
            try {
              const token = await getTokenRef.current({ skipCache: true });
              if (typeof token === "string" && token.trim().length > 0) {
                return token.trim();
              }
            } catch (reason) {
              console.warn("[desktop] Clerk getToken failed", reason);
            }
            return null;
          },
          deviceId(),
          async () => {
            // Wait until Clerk can mint a session JWT, then reuse the API client
            // path that already works for REST (same Authorization wiring).
            for (let attempt = 0; attempt < 8; attempt++) {
              try {
                const token = await getTokenRef.current({
                  skipCache: attempt > 0,
                });
                if (typeof token === "string" && token.trim().length > 0) {
                  return clientRef.current.getPowerSyncCredentials();
                }
              } catch (reason) {
                console.warn("[desktop] Clerk getToken failed", reason);
              }
              await new Promise((resolve) =>
                setTimeout(resolve, 120 * (attempt + 1)),
              );
            }
            throw new Error("Sign in to connect");
          },
        );
        databaseRef.current = next;
        connectorRef.current = connector;
        const dispose = next.registerListener({
          statusChanged: () => setStatusVersion((version) => version + 1),
        });
        try {
          await next.connect(connector);
          await next.waitForReady();
          if (!cancelled) setInitError(null);
        } catch (reason) {
          console.warn(
            "[desktop] PowerSync connect failed — REST lists still available",
            reason,
          );
          if (!cancelled) {
            setInitError(
              reason instanceof Error
                ? reason
                : new Error("PowerSync connect failed"),
            );
          }
        }
        if (!cancelled) setDatabaseState({ userId, database: next });
        if (cancelled) dispose();
      } catch (reason) {
        console.warn(
          "[desktop] PowerSync SQLite init failed — falling back to REST",
          reason,
        );
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
    };
    // Intentionally omit getToken — Clerk often returns a new function identity
    // every render, which would wipe/reconnect the DB in a loop.
  }, [apiUrl, backendMode, isLoaded, reconnectNonce, sessionId, userId]);

  const retry = useCallback(async () => {
    // Always full re-init — soft reconnect can no-op when the previous connect
    // never reached fetchCredentials (worker/WASM failures).
    setInitError(null);
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
  const value = useMemo<SyncState>(() => {
    let syncStatus: PowerSyncStatus = "idle";
    let message = "PowerSync idle";
    if (!isLoaded) {
      syncStatus = "connecting";
      message = "Loading session…";
    } else if (!userId || !sessionId) {
      syncStatus = "unauthenticated";
      message = "Sign in to enable PowerSync";
    } else if (initError && !database) {
      syncStatus = "rest-only";
      message = `PowerSync unavailable (${initError.message}) — using REST`;
    } else if (!database || status?.connecting) {
      syncStatus = "connecting";
      message = "Connecting PowerSync…";
    } else if (ready) {
      syncStatus = "ready";
      message = "PowerSync ready";
    } else if (initError) {
      syncStatus = "rest-only";
      message = `PowerSync partial (${initError.message}) — using REST fallback`;
    } else {
      syncStatus = "error";
      message = "PowerSync not ready";
    }

    return {
      status: syncStatus,
      message,
      database,
      connected: status?.connected ?? false,
      connecting: status?.connecting ?? false,
      ready,
      offline,
      lastSyncedAt: status?.lastSyncedAt ?? null,
      error: database ? syncError(database) ?? initError : initError,
      retry,
      createMetadata,
      patchMetadata,
    };
  }, [
    createMetadata,
    database,
    initError,
    isLoaded,
    offline,
    patchMetadata,
    ready,
    retry,
    sessionId,
    status,
    userId,
  ]);

  return (
    <PowerSyncContext.Provider value={value}>{children}</PowerSyncContext.Provider>
  );
}

/**
 * Real PowerSync web provider when Clerk session is present.
 * Falls back to REST-only when SQLite/WASM init fails (ADR-019).
 */
export function PowerSyncProvider({
  children,
  authenticated,
  apiUrl,
  backendMode,
}: {
  children: ReactNode;
  authenticated: boolean;
  apiUrl: string;
  backendMode: BackendMode;
}) {
  if (!authenticated) {
    return (
      <UnauthenticatedPowerSyncProvider>{children}</UnauthenticatedPowerSyncProvider>
    );
  }

  return (
    <AuthenticatedPowerSyncProvider apiUrl={apiUrl} backendMode={backendMode}>
      {children}
    </AuthenticatedPowerSyncProvider>
  );
}

export function useDesktopPowerSync() {
  return useContext(PowerSyncContext);
}

export function usePowerSyncQuery<T>(
  sql: string | null,
  parameters: unknown[] = [],
) {
  const { database, ready } = useDesktopPowerSync();
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

  useEffect(() => {
    if (!database || !ready || !sql) return;
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const watchResult of database.watch(sql, parameters, {
          signal: controller.signal,
          throttleMs: 100,
        })) {
          setResult({
            database,
            queryKey,
            rows: (watchResult.rows?._array ?? []) as T[],
          });
          setErrorState(null);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setErrorState({
            database,
            queryKey,
            error:
              reason instanceof Error
                ? reason
                : new Error("Local query failed"),
          });
        }
      }
    })();
    return () => controller.abort();
    // parameters are keyed by their serialized stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, parameterKey, ready, sql]);

  const data =
    result?.database === database && result.queryKey === queryKey
      ? result.rows
      : null;
  const error =
    errorState?.database === database && errorState.queryKey === queryKey
      ? errorState.error
      : null;
  return { data, error, loading: Boolean(sql) && ready && data === null };
}
