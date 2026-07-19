import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { createClerkTokenProvider, createApiClient } from "@backsteros/api-client";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { getAdminEnvironment } from "./env";

type AdminApiContextValue = {
  apiUrl: string;
  requestJson: <T>(path: string) => Promise<T>;
};

const AdminApiContext = createContext<AdminApiContextValue | null>(null);

function AdminApiProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const { apiUrl } = getAdminEnvironment();
  const tokenProvider = useMemo(
    () => createClerkTokenProvider(getToken),
    [getToken],
  );
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: apiUrl,
        getToken: isSignedIn ? tokenProvider : undefined,
      }),
    [apiUrl, isSignedIn, tokenProvider],
  );

  const value = useMemo(
    () => ({
      apiUrl,
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
    throw new Error("useAdminApi must be used within AdminProviders");
  }
  return ctx;
}

export function AdminProviders({ children }: { children: ReactNode }) {
  const { clerkPublishableKey } = getAdminEnvironment();

  if (!clerkPublishableKey) {
    return (
      <div className="admin-gate">
        <h1>BacksterOS Admin</h1>
        <p>
          Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in{" "}
          <code>backsteros-admin/.env</code>.
        </p>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <AdminApiProvider>{children}</AdminApiProvider>
    </ClerkProvider>
  );
}
