import { ApiClientError } from "@backsteros/api-client";
import {
  GITHUB_INTEGRATION_SCOPES,
  type GithubConnectionStatus,
  type GithubRepository,
} from "@backsteros/contracts";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export const GITHUB_OAUTH_SCOPES = [...GITHUB_INTEGRATION_SCOPES];

WebBrowser.maybeCompleteAuthSession();

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
        "GitHub status API is not deployed yet — showing repository list instead.",
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

/** Deep-link redirect Clerk returns to after GitHub OAuth on mobile. */
export function githubOauthRedirectUrl(): string {
  return Linking.createURL("sso-callback");
}

/**
 * Connect or reauthorize GitHub with integration scopes (repo + read:org).
 * Opens an in-app auth session and returns when Clerk redirects back.
 */
export async function startGithubOauthConnect(
  user: GithubUserLike,
): Promise<"success" | "cancel"> {
  const redirectUrl = githubOauthRedirectUrl();

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

  const result = await WebBrowser.openAuthSessionAsync(url.href, redirectUrl);
  if (result.type === "success") return "success";
  return "cancel";
}
