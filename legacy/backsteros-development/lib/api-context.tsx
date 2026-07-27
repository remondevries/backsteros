"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createApiClient,
  createClerkTokenProvider,
  type BacksterosApiClient,
} from "@backsteros/api-client";
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

type ApiContextValue = {
  client: BacksterosApiClient;
  apiUrl: string;
  refreshVersion: number;
  refresh: () => void;
};

const ApiContext = createContext<ApiContextValue | null>(null);

export function ConsoleApiProvider({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: ReactNode;
}) {
  const { getToken } = useAuth();
  const tokenProvider = useMemo(
    () => createClerkTokenProvider(() => getToken()),
    [getToken],
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const client = useMemo(
    () =>
      createApiClient({
        // Same-origin: Next rewrites /api/v1/* → NEXT_PUBLIC_API_URL
        baseUrl: "",
        getToken: tokenProvider,
      }),
    [tokenProvider],
  );
  const refresh = useCallback(
    () => setRefreshVersion((value) => value + 1),
    [],
  );

  return (
    <ApiContext.Provider value={{ client, apiUrl, refreshVersion, refresh }}>
      {children}
    </ApiContext.Provider>
  );
}

export function useConsoleApi() {
  const value = useContext(ApiContext);
  if (!value) {
    throw new Error("useConsoleApi must be used within ConsoleApiProvider");
  }
  return value;
}

export type ResourceState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
};

export function useApiResource<T>(
  load: (client: BacksterosApiClient, signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[] = [],
): ResourceState<T> {
  const { client, refreshVersion } = useConsoleApi();
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const [localVersion, setLocalVersion] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<T | null>(null);
  const identityKey = dependencies.map((entry) => String(entry)).join("\0");
  const identityKeyRef = useRef(identityKey);
  dataRef.current = data;

  useEffect(() => {
    const controller = new AbortController();
    const identityChanged = identityKeyRef.current !== identityKey;
    identityKeyRef.current = identityKey;

    setError(null);
    // Drop stale rows when the resource identity changes (e.g. project switch)
    // so skeletons show instead of the previous project's content.
    if (identityChanged) {
      dataRef.current = null;
      setData(null);
      setLoading(true);
    } else if (dataRef.current == null) {
      // Initial load only — keep existing rows visible during background revalidation.
      setLoading(true);
    }

    loadRef
      .current(client, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          dataRef.current = value;
          setData(value);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error ? reason : new Error("Request failed"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // Caller controls reload dependencies; load is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, refreshVersion, localVersion, identityKey]);

  return {
    data,
    error,
    loading,
    reload: () => setLocalVersion((value) => value + 1),
    setData,
  };
}

export function apiErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Something went wrong";
  const message = error.message.trim();
  if (
    message === "Failed to fetch" ||
    message === "NetworkError when attempting to fetch resource." ||
    message === "Load failed" ||
    error.name === "NetworkError"
  ) {
    return "Could not reach the API. Check that the backend is running.";
  }
  return message || "Something went wrong";
}
