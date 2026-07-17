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
  refreshVersion: number;
  refresh: () => void;
};

const ApiContext = createContext<ApiContextValue | null>(null);

export function AppApiProvider({
  apiUrl,
  children,
  tokenProvider,
}: {
  apiUrl: string;
  children: ReactNode;
  tokenProvider?: () => Promise<string | null>;
}) {
  if (tokenProvider) {
    return <AppApiProviderWithToken apiUrl={apiUrl} getToken={tokenProvider}>{children}</AppApiProviderWithToken>;
  }
  return <ClerkAppApiProvider apiUrl={apiUrl}>{children}</ClerkAppApiProvider>;
}

function ClerkAppApiProvider({ apiUrl, children }: { apiUrl: string; children: ReactNode }) {
  const { getToken } = useAuth();
  return <AppApiProviderWithToken apiUrl={apiUrl} getToken={() => getToken()}>{children}</AppApiProviderWithToken>;
}

function AppApiProviderWithToken({
  apiUrl,
  children,
  getToken,
}: {
  apiUrl: string;
  children: ReactNode;
  getToken: () => Promise<string | null>;
}) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: apiUrl,
        getToken: createClerkTokenProvider(getToken),
      }),
    [apiUrl, getToken],
  );
  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);
  return (
    <ApiContext.Provider value={{ client, refreshVersion, refresh }}>
      {children}
    </ApiContext.Provider>
  );
}

export function useAppApi() {
  const value = useContext(ApiContext);
  if (!value) throw new Error("useAppApi must be used within AppApiProvider");
  return value;
}

export type ResourceState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
};

export function useApiResource<T>(
  load: (client: BacksterosApiClient, signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[] = [],
): ResourceState<T> {
  const { client, refreshVersion } = useAppApi();
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const [localVersion, setLocalVersion] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    /* eslint-disable react-hooks/set-state-in-effect -- request lifecycle state is intentionally reset when the resource key changes */
    if (data === null) setLoading(true);
    else setRefreshing(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    loadRef.current(client, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason : new Error("Request failed"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => controller.abort();
    // The caller controls reload dependencies; load is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, refreshVersion, localVersion, ...dependencies]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => setLocalVersion((value) => value + 1),
    setData,
  };
}

export function json(path: string, init?: RequestInit) {
  return (client: BacksterosApiClient) => client.requestJson(path, init);
}

export function apiErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Something went wrong";
  }

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
