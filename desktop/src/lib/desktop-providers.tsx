import { ClerkProvider, useAuth, useClerk } from "@clerk/clerk-react";
import { createClerkTokenProvider } from "@backsteros/api-client";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { ApiProvider } from "./api-context";
import { DesktopAgentStatusProvider } from "./agent/agent-status-context";
import { dismissBootSplash } from "./boot-splash";
import { mergeClerkHandshakeQuery } from "./clerk-oauth-handoff";
import { getDesktopPublicEnvironment } from "./env";
import { PowerSyncProvider } from "./powersync-context";
import { DesktopWorkspaceDataProvider } from "./workspace-data";
import { isTauriRuntime } from "./whoop";
import { BootSplashWatchdog } from "../components/boot-splash-watchdog";
import { ConfigureAuthScreen } from "../screens/configure-auth-screen";
import { SignInScreen } from "../screens/sign-in-screen";

/** How often to poll Clerk for a session created in the OAuth popup. */
const OAUTH_SESSION_POLL_MS = 400;
/** Stop polling after this many attempts (~20s). */
const OAUTH_SESSION_POLL_MAX_ATTEMPTS = 50;
const OAUTH_PENDING_KEY = "backsteros.oauth.pending";

const CLERK_ALLOWED_REDIRECT_ORIGINS = [
  "tauri://localhost",
  "https://tauri.localhost",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
] as const;

function closeOauthWindows() {
  if (!isTauriRuntime()) return;
  void invoke("close_oauth_windows").catch(() => {
    /* window may already be gone */
  });
}

async function activateFirstSignedInSession(
  clerk: ReturnType<typeof useClerk>,
): Promise<boolean> {
  await clerk.client?.reload();
  const signedIn = clerk.client?.signedInSessions ?? [];
  const sessions = clerk.client?.sessions ?? [];
  const sessionId =
    signedIn[0]?.id ??
    sessions.find((session) => session.status === "active")?.id ??
    sessions[0]?.id;
  if (!sessionId) return false;
  await clerk.setActive({ session: sessionId });
  return Boolean(clerk.session?.id || clerk.user?.id);
}

/**
 * When Clerk's popup `postMessage` handoff fails in Tauri, activate any
 * session the shared WebView store already has — but only after OAuth
 * finishes. Important: do not put `clerk` in effect deps; `reload()`/`setActive`
 * change that identity, which used to cancel polling after the one-shot
 * `oauth-complete` event and leave the user stuck on SignIn (blank popup).
 */
function useOauthSessionRecovery(
  isLoaded: boolean,
  isSignedIn: boolean,
  enabled: boolean,
) {
  const clerk = useClerk();
  const clerkRef = useRef(clerk);
  clerkRef.current = clerk;

  useEffect(() => {
    if (!enabled || !isLoaded || isSignedIn || !isTauriRuntime()) {
      if (isSignedIn) {
        try {
          sessionStorage.removeItem(OAUTH_PENDING_KEY);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    let attempts = 0;
    let cancelled = false;
    let intervalId: number | null = null;

    const stopPolling = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const tryRecover = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const activated = await activateFirstSignedInSession(clerkRef.current);
        if (activated) {
          try {
            sessionStorage.removeItem(OAUTH_PENDING_KEY);
          } catch {
            /* ignore */
          }
          stopPolling();
          closeOauthWindows();
        }
      } catch {
        /* Clerk may not be ready yet; keep polling */
      }
      if (attempts >= OAUTH_SESSION_POLL_MAX_ATTEMPTS) {
        try {
          sessionStorage.removeItem(OAUTH_PENDING_KEY);
        } catch {
          /* ignore */
        }
        stopPolling();
      }
    };

    const startPolling = () => {
      try {
        sessionStorage.setItem(OAUTH_PENDING_KEY, "1");
      } catch {
        /* ignore */
      }
      if (intervalId != null) return;
      attempts = 0;
      void tryRecover();
      intervalId = window.setInterval(() => {
        if (cancelled) return;
        void tryRecover();
      }, OAUTH_SESSION_POLL_MS);
    };

    const onOauthComplete = () => {
      startPolling();
    };

    /**
     * Native shell extracts `__clerk_*` params from accounts `/popup-callback`
     * (postMessage often never reaches the opener in packaged WKWebView) and
     * reloads main so Clerk can consume the handshake on boot.
     */
    const onClerkHandshake = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query;
      if (!query) return;
      const nextHref = mergeClerkHandshakeQuery(window.location.href, query);
      if (!nextHref) {
        startPolling();
        return;
      }
      try {
        sessionStorage.setItem(OAUTH_PENDING_KEY, "1");
      } catch {
        /* ignore */
      }
      window.location.replace(nextHref);
    };

    window.addEventListener("backsteros:oauth-complete", onOauthComplete);
    window.addEventListener("backsteros:clerk-handshake", onClerkHandshake);

    // Resume if a previous attempt was cancelled by a Clerk identity churn.
    try {
      if (sessionStorage.getItem(OAUTH_PENDING_KEY) === "1") {
        startPolling();
      }
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener("backsteros:oauth-complete", onOauthComplete);
      window.removeEventListener("backsteros:clerk-handshake", onClerkHandshake);
    };
  }, [enabled, isLoaded, isSignedIn]);
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
  const { apiUrl } = getDesktopPublicEnvironment();
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

  // GitHub account linking finished in the OAuth popup — reload Clerk user and
  // stay signed in (do not remount / run sign-in SSO on main).
  const clerk = useClerk();
  useEffect(() => {
    if (!isSignedIn || isOverlay || !isTauriRuntime()) return;

    const onGithubOauthComplete = () => {
      void (async () => {
        try {
          await clerk.user?.reload();
        } catch {
          /* ignore */
        }
        closeOauthWindows();
        if (!window.location.pathname.includes("/settings/github")) {
          window.history.pushState({}, "", "/settings/github");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
        window.dispatchEvent(new CustomEvent("backsteros:github-status-refresh"));
      })();
    };

    window.addEventListener(
      "backsteros:github-oauth-complete",
      onGithubOauthComplete,
    );
    return () => {
      window.removeEventListener(
        "backsteros:github-oauth-complete",
        onGithubOauthComplete,
      );
    };
  }, [clerk, isOverlay, isSignedIn]);

  // Keep the HTML boot splash until Clerk resolves — do not mount a second
  // "Loading session…" screen on top of (or replacing) it.
  useEffect(() => {
    if (isOverlay || isLoaded) {
      dismissBootSplash();
    }
  }, [isLoaded, isOverlay]);

  const body = !isLoaded ? null : !isSignedIn ? (
    isOverlay ? (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
          color: "rgba(255,255,255,0.85)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          textAlign: "center",
          background: "rgba(20,20,20,0.92)",
          borderRadius: 12,
        }}
      >
        Sign in to BacksterOS in the main window, then try again.
      </div>
    ) : (
      <SignInScreen />
    )
  ) : (
    <ApiProvider apiUrl={apiUrl} getToken={tokenProvider}>
      <PowerSyncProvider authenticated={enablePowerSync} apiUrl={apiUrl}>
        <DesktopWorkspaceDataProvider>
          <DesktopAgentStatusProvider>{children}</DesktopAgentStatusProvider>
        </DesktopWorkspaceDataProvider>
      </PowerSyncProvider>
    </ApiProvider>
  );

  return (
    <BootSplashWatchdog cleared={isOverlay || isLoaded}>{body}</BootSplashWatchdog>
  );
}

/**
 * Clerk SPA when `VITE_CLERK_PUBLISHABLE_KEY` is set.
 * Without a key, shows configure-auth (no demo fixtures / empty shell).
 * Always targets local core via `VITE_API_URL` (default `http://127.0.0.1:8788`).
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
  const { clerkPublishableKey } = getDesktopPublicEnvironment();
  const isOverlay =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/desktop-overlay");

  useEffect(() => {
    if (!clerkPublishableKey || isOverlay) {
      dismissBootSplash();
    }
  }, [clerkPublishableKey, isOverlay]);

  if (!clerkPublishableKey) {
    return isOverlay ? null : <ConfigureAuthScreen />;
  }

  const redirectOrigins =
    typeof window !== "undefined"
      ? Array.from(
          new Set([window.location.origin, ...CLERK_ALLOWED_REDIRECT_ORIGINS]),
        )
      : [...CLERK_ALLOWED_REDIRECT_ORIGINS];

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      allowedRedirectOrigins={redirectOrigins}
      allowedRedirectProtocols={["http:", "https:", "tauri:"]}
    >
      <AuthenticatedProviders
        enablePowerSync={enablePowerSync}
        isOverlay={isOverlay}
      >
        {children}
      </AuthenticatedProviders>
    </ClerkProvider>
  );
}
