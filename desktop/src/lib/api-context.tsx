import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import {
  createApiClient,
  type BacksterosApiClient,
  type TokenProvider,
} from "@backsteros/api-client";

import { sseUrlForApiUrl } from "./env";

type ApiContextValue = {
  client: BacksterosApiClient;
  apiUrl: string;
};

const ApiContext = createContext<ApiContextValue | null>(null);

function createDesktopFetch(apiUrl: string): typeof globalThis.fetch {
  const sseBase = sseUrlForApiUrl(apiUrl);
  const apiBase = apiUrl.replace(/\/$/, "");
  if (sseBase === apiBase) {
    return globalThis.fetch.bind(globalThis);
  }
  return (input, init) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (raw.includes("/events") && raw.startsWith(apiBase)) {
      return globalThis.fetch(`${sseBase}${raw.slice(apiBase.length)}`, init);
    }
    return globalThis.fetch(input as RequestInfo, init);
  };
}

export function ApiProvider({
  children,
  apiUrl,
  getToken,
}: {
  children: ReactNode;
  apiUrl: string;
  getToken?: TokenProvider;
}) {
  // Keep the client stable when the token provider identity churns each render
  // so dependents (e.g. task comments) do not refetch and flash errors.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const hasTokenProvider = getToken != null;

  const value = useMemo(
    () => ({
      apiUrl,
      client: createApiClient({
        baseUrl: apiUrl,
        getToken: hasTokenProvider
          ? () => getTokenRef.current?.()
          : undefined,
        fetch: createDesktopFetch(apiUrl),
      }),
    }),
    [apiUrl, hasTokenProvider],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useDesktopApi() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error("useDesktopApi must be used within ApiProvider");
  }
  return context;
}
