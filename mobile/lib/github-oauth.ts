import { ApiClientError } from "@backsteros/api-client";
import {
  GITHUB_INTEGRATION_SCOPES,
  type GithubConnectionStatus,
  type GithubRepository,
} from "@backsteros/contracts";

export const GITHUB_OAUTH_SCOPES = [...GITHUB_INTEGRATION_SCOPES];

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
          "GitHub is not connected. Add a personal access token in Settings → GitHub.",
      );
    }
    throw error;
  }
}
