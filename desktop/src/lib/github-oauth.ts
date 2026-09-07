import { ApiClientError } from "@backsteros/api-client";
import {
  GITHUB_INTEGRATION_SCOPES,
  type GithubConnectionStatus,
  type GithubRepository,
} from "@backsteros/contracts";

import { isTauriRuntime } from "./whoop";

export const GITHUB_OAUTH_SCOPES = [...GITHUB_INTEGRATION_SCOPES];

export const GITHUB_SSO_CALLBACK_PATH = "/sso-callback";

/** Lightweight return path for Tauri OAuth popup (no Clerk sign-in callback). */
export const GITHUB_OAUTH_POPUP_DONE_PATH = "/oauth/popup-done";

export const GITHUB_OAUTH_RETURN_STORAGE_KEY =
  "backsteros.desktop.github.oauth.return";

const GITHUB_OAUTH_POPUP_NAME = "backsteros-github-oauth";

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
          "GitHub is not connected. Add a personal access token in Settings → GitHub.",
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

/** Prefer a no-op done page in Tauri so the popup never runs sign-in SSO. */
export function githubOauthPopupDoneUrl(origin = window.location.origin): string {
  return `${githubAppOrigin(origin)}${GITHUB_OAUTH_POPUP_DONE_PATH}`;
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
    // ignore
  }
}

export function isGithubOauthReturnUrl(value: string): boolean {
  // Packaged Tauri uses `tauri://localhost`; allow that plus http(s).
  return /^(https?:|tauri:)\/\//i.test(value);
}

export function consumeGithubOauthReturnUrl(
  fallback = githubSettingsReturnUrl(),
): string {
  try {
    const stored = sessionStorage.getItem(GITHUB_OAUTH_RETURN_STORAGE_KEY);
    sessionStorage.removeItem(GITHUB_OAUTH_RETURN_STORAGE_KEY);
    if (stored && isGithubOauthReturnUrl(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export async function startGithubOauthConnect(
  user: GithubUserLike,
  redirectUrl: string = isTauriRuntime()
    ? githubOauthPopupDoneUrl()
    : githubSsoCallbackUrl(),
  returnUrl: string = githubSettingsReturnUrl(),
): Promise<void> {
  rememberGithubOauthReturnUrl(returnUrl);

  const existing = user.externalAccounts.find(
    (account) =>
      account.provider === "github" || account.provider === "oauth_github",
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

  // Tauri blocks main-window navigations to github.com (keeps the shell on the
  // app origin). Open the authorize URL in a related webview — same path as
  // Clerk oauthFlow="popup" for sign-in — so on_new_window can host it and
  // soft-notify main when GitHub finishes (never remount main).
  if (isTauriRuntime()) {
    const popup = window.open(
      url.href,
      GITHUB_OAUTH_POPUP_NAME,
      "popup=yes,width=520,height=780",
    );
    if (!popup) {
      throw new Error(
        "Could not open the GitHub authorization window. Try again.",
      );
    }
    return;
  }

  window.location.href = url.href;
}
