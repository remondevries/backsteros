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

type ApiContextValue = {
  client: BacksterosApiClient;
  apiUrl: string;
};

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({
  children,
  apiUrl,
  getToken,
}: {
  children: ReactNode;
  apiUrl: string;
  getToken?: TokenProvider;
}) {
  // Clerk often returns a new getToken identity each render. Keep the client
  // stable so dependents (e.g. task comments) do not refetch and flash errors.
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
