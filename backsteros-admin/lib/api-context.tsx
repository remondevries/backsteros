"use client";

import {
  createApiClient,
  createClerkTokenProvider,
  type BacksterosApiClient,
} from "@backsteros/api-client";
import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

type AdminApiContextValue = {
  apiUrl: string;
  client: BacksterosApiClient;
  requestJson: <T>(path: string) => Promise<T>;
};

const AdminApiContext = createContext<AdminApiContextValue | null>(null);

export function AdminApiProvider({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: ReactNode;
}) {
  const { getToken, isSignedIn } = useAuth();
  const tokenProvider = useMemo(
    () => createClerkTokenProvider(getToken),
    [getToken],
  );
  const client = useMemo(
    () =>
      createApiClient({
        // Same-origin: Next proxies /api/v1/* and /api/health → NEXT_PUBLIC_API_URL
        baseUrl: "",
        getToken: isSignedIn ? tokenProvider : undefined,
      }),
    [isSignedIn, tokenProvider],
  );

  const value = useMemo(
    () => ({
      apiUrl,
      client,
      requestJson: <T,>(path: string) => client.requestJson<T>(path),
    }),
    [apiUrl, client],
  );

  return (
    <AdminApiContext.Provider value={value}>{children}</AdminApiContext.Provider>
  );
}

export function useAdminApi() {
  const ctx = useContext(AdminApiContext);
  if (!ctx) {
    throw new Error("useAdminApi must be used within AdminApiProvider");
  }
  return ctx;
}
