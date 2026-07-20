import { ClerkProvider, useAuth, useClerk } from "@clerk/clerk-react";
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

/** How often to poll Clerk for a session created in the OAuth popup. */
const OAUTH_SESSION_POLL_MS = 1000;
/** Stop polling after this many attempts (~45s). */
const OAUTH_SESSION_POLL_MAX_ATTEMPTS = 45;

function closeOauthWindows() {
  if (!isTauriRuntime()) return;
  void invoke("close_oauth_windows").catch(() => {
    /* window may already be gone */
  });
}

/**
 * When Clerk's popup `postMessage` handoff fails in Tauri (no opener after
 * GitHub), the session cookie may still exist on the shared WebView store.
 * Reload the client and activate any session we find.
 */
function useOauthSessionRecovery(
  isLoaded: boolean,
  isSignedIn: boolean,
  enabled: boolean,
) {
  const clerk = useClerk();

  useEffect(() => {
    if (!enabled || !isLoaded || isSignedIn || !isTauriRuntime()) return;

    let attempts = 0;
    let cancelled = false;

    const tryRecover = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        await clerk.client?.reload();
        const sessionId =
          clerk.client?.signedInSessions?.[0]?.id ??
          clerk.client?.sessions?.[0]?.id;
        if (sessionId) {
          await clerk.setActive({ session: sessionId });
        }
      } catch {
        /* Clerk may not be ready yet; keep polling */
      }
    };

    void tryRecover();
    const id = window.setInterval(() => {
      if (cancelled || attempts >= OAUTH_SESSION_POLL_MAX_ATTEMPTS) {
        window.clearInterval(id);
        return;
      }
      void tryRecover();
    }, OAUTH_SESSION_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [clerk, enabled, isLoaded, isSignedIn]);
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

  useOauthSessionRecovery(isLoaded, Boolean(isSignedIn), !isOverlay);

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
