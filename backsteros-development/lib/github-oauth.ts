import { ApiClientError } from "@backsteros/api-client";
import {
  GITHUB_INTEGRATION_SCOPES,
  type GithubConnectionStatus,
  type GithubRepository,
} from "@backsteros/contracts";

export const GITHUB_OAUTH_SCOPES = [...GITHUB_INTEGRATION_SCOPES];

export const GITHUB_SSO_CALLBACK_PATH = "/sso-callback";

/** Where to send the user after GitHub OAuth finishes (absolute URL). */
export const GITHUB_OAUTH_RETURN_STORAGE_KEY =
  "backsteros.development.github.oauth.return";

type GithubExternalAccountLike = {
  provider: string;
  reauthorize: (params: {
    additionalScopes: string[];
    redirectUrl: string;
  }) => Promise<{
    verification?: {
      externalVerificationRedirectURL?: URL | null;
    } | null;
  }>;
};

type GithubUserLike = {
  externalAccounts: GithubExternalAccountLike[];
  createExternalAccount: (params: {
    strategy: "oauth_github";
    redirectUrl: string;
    additionalScopes: string[];
  }) => Promise<{
    verification?: {
      externalVerificationRedirectURL?: URL | null;
    } | null;
  }>;
};

type GithubStatusClient = {
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

function disconnectedStatus(reason: string): GithubConnectionStatus {
  return {
    connected: false,
    login: null,
    scopes: [],
    requiredScopes: [...GITHUB_INTEGRATION_SCOPES],
    missingScopes: [...GITHUB_INTEGRATION_SCOPES],
    organizations: [],
    repositoryCount: null,
    reason,
  };
}

/**
 * Prefer `/api/v1/github/status`. If production has not deployed that route yet
 * (404), fall back to `/api/v1/github/repositories`.
 */
export async function fetchGithubConnectionStatus(
  client: GithubStatusClient,
): Promise<GithubConnectionStatus> {
  try {
    return await client.requestJson<GithubConnectionStatus>(
      "/api/v1/github/status",
    );
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 404) {
      throw error;
    }
  }

  try {
    const body = await client.requestJson<{ repositories: GithubRepository[] }>(
      "/api/v1/github/repositories",
    );
    const repositories = body.repositories ?? [];
    const owners = new Map<string, { id: number; login: string }>();
    for (const repo of repositories) {
      if (!owners.has(repo.ownerLogin)) {
        owners.set(repo.ownerLogin, { id: repo.id, login: repo.ownerLogin });
      }
    }
    return {
      connected: true,
      login: null,
      scopes: [],
      requiredScopes: [...GITHUB_INTEGRATION_SCOPES],
      missingScopes: [],
      organizations: [...owners.values()].map((owner) => ({
        id: owner.id,
        login: owner.login,
        avatarUrl: null,
      })),
      repositoryCount: repositories.length,
      reason:
        "GitHub status API is not deployed yet — showing repository list instead. Deploy backsteros-api for full status (scopes, orgs).",
    };
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      (error.status === 401 || error.status === 403)
    ) {
      return disconnectedStatus(
        error.message ||
          "GitHub is not connected. Connect GitHub and grant repo + organization access.",
      );
    }
    throw error;
  }
}

export function githubAppOrigin(origin = window.location.origin): string {
  return origin.replace(/\/$/, "");
}

export function githubSsoCallbackUrl(origin = window.location.origin): string {
  return `${githubAppOrigin(origin)}${GITHUB_SSO_CALLBACK_PATH}`;
}

export function githubSettingsReturnUrl(origin = window.location.origin): string {
  return `${githubAppOrigin(origin)}/settings/github`;
}

export function rememberGithubOauthReturnUrl(
  returnUrl = githubSettingsReturnUrl(),
): void {
  try {
    sessionStorage.setItem(GITHUB_OAUTH_RETURN_STORAGE_KEY, returnUrl);
  } catch {
    // private mode / blocked storage — force redirect URLs still apply
  }
}

export function consumeGithubOauthReturnUrl(
  fallback = githubSettingsReturnUrl(),
): string {
  try {
    const stored = sessionStorage.getItem(GITHUB_OAUTH_RETURN_STORAGE_KEY);
    sessionStorage.removeItem(GITHUB_OAUTH_RETURN_STORAGE_KEY);
    if (stored && /^https?:\/\//i.test(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Starts Clerk GitHub OAuth (connect or reauthorize) with org + repo scopes.
 * Opens GitHub authorization in a popup (Tauri cannot navigate the main window
 * to github.com). Falls back to a full-page redirect in the browser if the
 * popup is blocked.
 *
 * Always pass an absolute `redirectUrl` on this origin (e.g. localhost:3100).
 * Relative paths are resolved against the Clerk app home URL (production /app).
 */
export async function startGithubOauthConnect(
  user: GithubUserLike,
  redirectUrl: string = githubSsoCallbackUrl(),
  returnUrl: string = githubSettingsReturnUrl(),
): Promise<void> {
  rememberGithubOauthReturnUrl(returnUrl);

  const existing = user.externalAccounts.find(
    (account) => account.provider === "github",
  );

  const account = existing
    ? await existing.reauthorize({
        additionalScopes: GITHUB_OAUTH_SCOPES,
        redirectUrl,
      })
    : await user.createExternalAccount({
        strategy: "oauth_github",
        redirectUrl,
        additionalScopes: GITHUB_OAUTH_SCOPES,
      });

  const url = account.verification?.externalVerificationRedirectURL;
  if (!url) {
    throw new Error("Clerk did not return a GitHub authorization URL.");
  }

  // Tauri blocks main-window navigations to github.com (keeps the shell intact).
  // Use window.open so the native on_new_window handler can host the OAuth flow.
  // WKWebView/Tauri may still report a null Window handle even when the native
  // popup was created successfully.
  const popup = window.open(
    url.href,
    "backsteros-github-oauth",
    "width=600,height=800",
  );
  const isTauri = Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
  if (popup != null || isTauri) {
    return;
  }
  // Browser fallback when popups are blocked.
  window.location.href = url.href;
}
