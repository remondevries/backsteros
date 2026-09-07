import { ClerkProvider, useAuth, useClerk } from "@clerk/clerk-react";
import { invoke } from "./tauri-invoke-instrumentation";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { ApiProvider } from "./api-context";
import { AgentMailProvider } from "./agentmail-context";
import { DesktopAgentStatusProvider } from "./agent/agent-status-context";
import { WorkspaceEventsProvider } from "./workspace-events-provider";
import { dismissBootSplash } from "./boot-splash";
import { mergeClerkHandshakeQuery } from "./clerk-oauth-handoff";
import { getDesktopPublicEnvironment } from "./env";
import { createDesktopTokenProvider } from "./local-shell-auth";
import { PowerSyncProvider } from "./powersync-context";
import { DesktopWorkspaceDataProvider } from "./workspace-data";
import { isTauriRuntime } from "./whoop";
import { BootSplashWatchdog } from "../components/boot-splash-watchdog";

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

function WorkspaceProviders({
  children,
  enablePowerSync,
  getToken,
}: {
  children: ReactNode;
  enablePowerSync: boolean;
  getToken: ReturnType<typeof createDesktopTokenProvider>;
}) {
  const { apiUrl } = getDesktopPublicEnvironment();

  return (
    <ApiProvider apiUrl={apiUrl} getToken={getToken}>
      <PowerSyncProvider authenticated={enablePowerSync} apiUrl={apiUrl}>
        <DesktopWorkspaceDataProvider>
          <WorkspaceEventsProvider>
            <AgentMailProvider>
              <DesktopAgentStatusProvider>
                {children}
              </DesktopAgentStatusProvider>
            </AgentMailProvider>
          </WorkspaceEventsProvider>
        </DesktopWorkspaceDataProvider>
      </PowerSyncProvider>
    </ApiProvider>
  );
}

/**
 * When Clerk is configured: keep it for account features, but do not gate the
 * product shell on sign-in — local-shell bearer opens the workspace. GitHub
 * API access uses Settings PAT / env token, not Clerk OAuth.
 */
function ClerkOptionalProviders({
  children,
  enablePowerSync,
  isOverlay,
}: {
  children: ReactNode;
  enablePowerSync: boolean;
  isOverlay: boolean;
}) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const tokenProvider = useMemo(
    () =>
      createDesktopTokenProvider(async () => {
        const token = await getToken();
        return token ?? null;
      }, Boolean(isSignedIn)),
    [getToken, isSignedIn],
  );

  useOauthSessionRecovery(isLoaded, Boolean(isSignedIn), !isOverlay);

  useEffect(() => {
    if (isSignedIn) {
      closeOauthWindows();
    }
  }, [isSignedIn]);

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

  useEffect(() => {
    if (isOverlay || isLoaded) {
      dismissBootSplash();
    }
  }, [isLoaded, isOverlay]);

  // Wait for Clerk to load so we know whether to prefer a session JWT, then
  // always mount the workspace (local-shell when signed out).
  const body =
    !isLoaded && !isOverlay ? null : (
      <WorkspaceProviders
        enablePowerSync={enablePowerSync}
        getToken={tokenProvider}
      >
        {children}
      </WorkspaceProviders>
    );

  return (
    <BootSplashWatchdog cleared={isOverlay || isLoaded}>{body}</BootSplashWatchdog>
  );
}

function LocalOnlyProviders({
  children,
  enablePowerSync,
}: {
  children: ReactNode;
  enablePowerSync: boolean;
}) {
  const tokenProvider = useMemo(
    () => createDesktopTokenProvider(async () => null, false),
    [],
  );

  useEffect(() => {
    dismissBootSplash();
  }, []);

  return (
    <BootSplashWatchdog cleared>
      <WorkspaceProviders
        enablePowerSync={enablePowerSync}
        getToken={tokenProvider}
      >
        {children}
      </WorkspaceProviders>
    </BootSplashWatchdog>
  );
}

/**
 * Opens the product shell immediately via local-shell auth.
 * Clerk is optional — account UI when configured. GitHub commits use
 * Settings PAT / GITHUB_API_TOKEN (not Clerk OAuth).
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

  if (!clerkPublishableKey) {
    return (
      <LocalOnlyProviders enablePowerSync={enablePowerSync}>
        {children}
      </LocalOnlyProviders>
    );
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
      <ClerkOptionalProviders
        enablePowerSync={enablePowerSync}
        isOverlay={isOverlay}
      >
        {children}
      </ClerkOptionalProviders>
    </ClerkProvider>
  );
}
