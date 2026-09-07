import type { AuthContext } from "../middleware/auth.js";

export function getConfiguredGithubApiToken(): string | null {
  const token = process.env.GITHUB_API_TOKEN?.trim();
  return token || null;
}

export function isGithubServerTokenConfigured(): boolean {
  return getConfiguredGithubApiToken() != null;
}

/**
 * Pure selection order for GitHub API access:
 * workspace Settings PAT → env `GITHUB_API_TOKEN` → optional Clerk OAuth.
 * Clerk is never required when a PAT is configured.
 */
export function selectGithubAccessToken(sources: {
  workspaceToken: string | null;
  envToken: string | null;
  clerkOauthToken?: string | null;
}): string | null {
  if (sources.workspaceToken) return sources.workspaceToken;
  if (sources.envToken) return sources.envToken;
  if (sources.clerkOauthToken) return sources.clerkOauthToken;
  return null;
}

async function githubServiceError(
  message: string,
  code: string,
  status: 403,
): Promise<never> {
  const { GithubServiceError } = await import("./github.js");
  throw new GithubServiceError(message, code, status);
}

/**
 * Resolve a GitHub API token for the current auth.
 *
 * Prefer a workspace Settings PAT (or `GITHUB_API_TOKEN`) so commit/PR fetches
 * never require Clerk. Optional Clerk OAuth is only a fallback when no PAT is
 * configured and the request is authenticated as a Clerk user.
 */
export async function resolveGithubAccessToken(
  auth: AuthContext,
): Promise<string> {
  const { getWorkspaceGithubApiToken } = await import("./github-settings.js");
  const workspaceToken = await getWorkspaceGithubApiToken(auth.workspaceId);
  const envToken = getConfiguredGithubApiToken();
  const fromPat = selectGithubAccessToken({
    workspaceToken,
    envToken,
  });
  if (fromPat) {
    return fromPat;
  }

  if (auth.kind === "clerk" && auth.clerkUserId) {
    const { getGithubAccessToken } = await import("./github.js");
    return getGithubAccessToken(auth.clerkUserId);
  }

  if (auth.kind === "api_key" || auth.kind === "local_shell") {
    return githubServiceError(
      "GitHub is not configured. Add a personal access token in Settings → GitHub (or set GITHUB_API_TOKEN).",
      "github_token_missing",
      403,
    );
  }

  return githubServiceError(
    "GitHub integration requires a Settings → GitHub token, Clerk OAuth, or GITHUB_API_TOKEN",
    "github_auth_required",
    403,
  );
}
