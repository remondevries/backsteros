import {
  createContext,
  useContext,
  useMemo,
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
  const value = useMemo(
    () => ({
      apiUrl,
      client: createApiClient({
        baseUrl: apiUrl,
        getToken,
      }),
    }),
    [apiUrl, getToken],
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
