import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { createClerkTokenProvider } from "@backsteros/api-client";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, type ReactNode } from "react";

import { ApiProvider } from "./api-context";
import {
  BackendModeProvider,
  useBackendMode,
} from "./backend-mode-context";
import { getDesktopPublicEnvironment } from "./env";
import { PowerSyncProvider } from "./powersync-context";
import { isTauriRuntime } from "./whoop";
import { ConfigureAuthScreen } from "../screens/configure-auth-screen";
import {
  SignInLoadingScreen,
  SignInScreen,
} from "../screens/sign-in-screen";

function closeOauthWindows() {
  if (!isTauriRuntime()) return;
  void invoke("close_oauth_windows").catch(() => {
    /* window may already be gone */
  });
}

function AuthenticatedProviders({
  children,
  enablePowerSync,
  isOverlay,
}: {
  children: ReactNode;
  enablePowerSync: boolean;
  isOverlay: boolean;
}) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { apiUrl, mode } = useBackendMode();
  const tokenProvider = useMemo(
    () => createClerkTokenProvider(getToken),
    [getToken],
  );

  useEffect(() => {
    if (isSignedIn) {
      closeOauthWindows();
    }
  }, [isSignedIn]);

  if (!isLoaded) {
    // Overlay must stay transparent — never flash the branded loading screen.
    if (isOverlay) {
      return null;
    }
    return <SignInLoadingScreen />;
  }

  if (!isSignedIn) {
    if (isOverlay) {
      return null;
    }
    return <SignInScreen />;
  }

  return (
    <ApiProvider apiUrl={apiUrl} getToken={tokenProvider}>
      <PowerSyncProvider
        authenticated={enablePowerSync}
        apiUrl={apiUrl}
        backendMode={mode}
      >
        {children}
      </PowerSyncProvider>
    </ApiProvider>
  );
}

function ProvidersWithBackend({
  children,
  enablePowerSync,
  isOverlay,
}: {
  children: ReactNode;
  enablePowerSync: boolean;
  isOverlay: boolean;
}) {
  const { clerkPublishableKey } = getDesktopPublicEnvironment();

  if (!clerkPublishableKey) {
    return isOverlay ? null : <ConfigureAuthScreen />;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <AuthenticatedProviders
        enablePowerSync={enablePowerSync}
        isOverlay={isOverlay}
      >
        {children}
      </AuthenticatedProviders>
    </ClerkProvider>
  );
}

/**
 * Clerk SPA when `VITE_CLERK_PUBLISHABLE_KEY` is set.
 * Without a key, shows configure-auth (no demo fixtures / empty shell).
 * Backend mode (Dev/Prod) is Vite-dev only — see {@link BackendModeProvider}.
 *
 * `enablePowerSync` defaults on; the compose overlay webview sets it false so
 * we do not open a second SQLite sync connection.
 */
export function DesktopProviders({
  children,
  enablePowerSync = true,
}: {
  children: ReactNode;
  enablePowerSync?: boolean;
}) {
  const { apiUrl } = getDesktopPublicEnvironment();
  const isOverlay =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/desktop-overlay");

  return (
    <BackendModeProvider envApiUrl={apiUrl}>
      <ProvidersWithBackend
        enablePowerSync={enablePowerSync}
        isOverlay={isOverlay}
      >
        {children}
      </ProvidersWithBackend>
    </BackendModeProvider>
  );
}
