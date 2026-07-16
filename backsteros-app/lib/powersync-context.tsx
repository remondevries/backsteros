"use client";

import { useAuth } from "@clerk/nextjs";
import type { PowerSyncDatabase } from "@powersync/web";
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

import {
  BacksterPowerSyncConnector,
  createPowerSyncDatabase,
} from "./powersync";

export const SYNCED_METADATA_TABLES = [
  "projects", "tasks", "documents", "organizations", "contacts", "letters",
  "workspace_settings",
] as const;
export type SyncedMetadataTable = (typeof SYNCED_METADATA_TABLES)[number];

type SyncState = {
  database: PowerSyncDatabase | null;
  connected: boolean;
  connecting: boolean;
  ready: boolean;
  offline: boolean;
  lastSyncedAt: Date | null;
  error: Error | null;
  retry: () => Promise<void>;
  createMetadata: (
    table: SyncedMetadataTable,
    values: Record<string, unknown>,
  ) => Promise<string>;
  patchMetadata: (
    table: SyncedMetadataTable,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
};

const PowerSyncContext = createContext<SyncState | null>(null);

function deviceId(): string {
  const key = "backsteros:powersync-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function syncError(database: PowerSyncDatabase): Error | null {
  return database.currentStatus.dataFlowStatus.downloadError
    ?? database.currentStatus.dataFlowStatus.uploadError
    ?? null;
}

const e2eSyncState: SyncState = {
  database: null,
  connected: false,
  connecting: false,
  ready: false,
  offline: false,
  lastSyncedAt: null,
  error: null,
  retry: async () => {},
  createMetadata: async () => {
    throw new Error("Offline database is disabled in browser tests");
  },
  patchMetadata: async () => {
    throw new Error("Offline database is disabled in browser tests");
  },
};

export function PowerSyncProvider({
  e2e = false,
  ...props
}: {
  apiUrl: string;
  children: ReactNode;
  e2e?: boolean;
}) {
  if (e2e) {
    return <PowerSyncContext.Provider value={e2eSyncState}>{props.children}</PowerSyncContext.Provider>;
  }
  return <AuthenticatedPowerSyncProvider {...props} />;
}

function AuthenticatedPowerSyncProvider({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: ReactNode;
}) {
  const { isLoaded, userId, sessionId, getToken } = useAuth();
  const [databaseState, setDatabaseState] = useState<{
    userId: string;
    database: PowerSyncDatabase;
  } | null>(null);
  const database =
    sessionId && databaseState?.userId === userId ? databaseState.database : null;
  const [offline, setOffline] = useState(false);
  const [, setStatusVersion] = useState(0);
  const databaseRef = useRef<PowerSyncDatabase | null>(null);
  const connectorRef = useRef<BacksterPowerSyncConnector | null>(null);
  const transitionRef = useRef(Promise.resolve());

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
    transitionRef.current = transitionRef.current.then(async () => {
      const previous = databaseRef.current;
      databaseRef.current = null;
      connectorRef.current = null;
      if (previous) {
        await previous.disconnectAndClear();
        await previous.close({ disconnect: true });
      }
      if (cancelled || !userId || !sessionId) {
        if (!cancelled) setDatabaseState(null);
        return;
      }

      const next = createPowerSyncDatabase(userId);
      const connector = new BacksterPowerSyncConnector(
        apiUrl,
        () => getToken().then((token) => token ?? null),
        deviceId(),
      );
      databaseRef.current = next;
      connectorRef.current = connector;
      const dispose = next.registerListener({
        statusChanged: () => setStatusVersion((version) => version + 1),
      });
      try {
        await next.connect(connector);
        await next.waitForReady();
        if (!cancelled) setDatabaseState({ userId, database: next });
      } catch {
        if (!cancelled) {
          setDatabaseState({ userId, database: next });
          setStatusVersion((version) => version + 1);
        }
      }
      if (cancelled) dispose();
    });
    return () => {
      cancelled = true;
    };
  }, [apiUrl, getToken, isLoaded, sessionId, userId]);

  const retry = useCallback(async () => {
    const db = databaseRef.current;
    const connector = connectorRef.current;
    if (!db || !connector) return;
    await db.connect(connector);
  }, []);

  const patchMetadata = useCallback(async (
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
  }, []);

  const createMetadata = useCallback(async (
    table: SyncedMetadataTable,
    values: Record<string, unknown>,
  ) => {
    const db = databaseRef.current;
    if (!db) throw new Error("Offline database is not ready");
    const id = crypto.randomUUID().replaceAll("-", "");
    const now = new Date().toISOString();
    const complete = { ...values, created_at: now, updated_at: now, deleted_at: null };
    const entries = Object.entries(complete);
    const columns = entries.map(([key]) => {
      if (!/^[a-z_]+$/.test(key)) throw new Error("Invalid metadata field");
      return key;
    });
    await db.execute(
      `INSERT INTO ${table} (id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
      [id, ...entries.map(([, value]) => value)],
    );
    return id;
  }, []);

  const status = database?.currentStatus;
  const value = useMemo<SyncState>(() => ({
    database,
    connected: status?.connected ?? false,
    connecting: status?.connecting ?? false,
    ready: Boolean(database?.ready),
    offline,
    lastSyncedAt: status?.lastSyncedAt ?? null,
    error: database ? syncError(database) : null,
    retry,
    createMetadata,
    patchMetadata,
  }), [
    createMetadata, database, offline, patchMetadata, retry, status,
  ]);

  return <PowerSyncContext.Provider value={value}>{children}</PowerSyncContext.Provider>;
}

export function usePowerSync() {
  const value = useContext(PowerSyncContext);
  if (!value) throw new Error("usePowerSync must be used within PowerSyncProvider");
  return value;
}

export function usePowerSyncQuery<T>(
  sql: string | null,
  parameters: unknown[] = [],
) {
  const { database, ready } = usePowerSync();
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
        for await (const result of database.watch(sql, parameters, {
          signal: controller.signal,
          throttleMs: 100,
        })) {
          setResult({
            database,
            queryKey,
            rows: (result.rows?._array ?? []) as T[],
          });
          setErrorState(null);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setErrorState({
            database,
            queryKey,
            error: reason instanceof Error ? reason : new Error("Local query failed"),
          });
        }
      }
    })();
    return () => controller.abort();
    // parameters are keyed by their serialized stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, parameterKey, ready, sql]);

  const data =
    result?.database === database && result.queryKey === queryKey ? result.rows : null;
  const error =
    errorState?.database === database && errorState.queryKey === queryKey
      ? errorState.error
      : null;
  return { data, error, loading: Boolean(sql) && ready && data === null };
}
