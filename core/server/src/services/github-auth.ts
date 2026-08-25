import type { AuthContext } from "../middleware/auth.js";

export function getConfiguredGithubApiToken(): string | null {
  const token = process.env.GITHUB_API_TOKEN?.trim();
  return token || null;
}

export function isGithubServerTokenConfigured(): boolean {
  return getConfiguredGithubApiToken() != null;
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
 * Clerk OAuth on desktop; GITHUB_API_TOKEN on cloud-core for portal API keys.
 */
export async function resolveGithubAccessToken(
  auth: AuthContext,
): Promise<string> {
  if (auth.kind === "clerk" && auth.clerkUserId) {
    const { getGithubAccessToken } = await import("./github.js");
    return getGithubAccessToken(auth.clerkUserId);
  }

  if (auth.kind === "api_key") {
    const token = getConfiguredGithubApiToken();
    if (token) {
      return token;
    }
    return githubServiceError(
      "GitHub is not configured on this server. Set GITHUB_API_TOKEN for API access.",
      "github_token_missing",
      403,
    );
  }

  return githubServiceError(
    "GitHub integration requires Clerk sign-in or a configured server token",
    "github_auth_required",
    403,
  );
}
