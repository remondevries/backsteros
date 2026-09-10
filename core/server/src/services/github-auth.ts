import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AuthContext } from "../middleware/auth.js";

function readTokenFromGithubEnvFile(): string | null {
  try {
    const filePath = path.join(os.homedir(), ".config", "secrets", "github.env");
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = /^(?:export\s+)?(?:GITHUB_API_TOKEN|GITHUB_TOKEN|GH_TOKEN)=(.+)$/u.exec(
        line.trim(),
      );
      if (!match) continue;
      const value = match[1]!.trim().replace(/^['"]|['"]$/gu, "");
      if (value) return value;
    }
  } catch {
    // Fall through.
  }
  return null;
}

/**
 * Env / machine-secret GitHub PAT used when workspace Settings has no token.
 * Order: `GITHUB_API_TOKEN` → `GITHUB_TOKEN` → `GH_TOKEN` → `~/.config/secrets/github.env`.
 */
export function getConfiguredGithubApiToken(): string | null {
  const fromEnv =
    process.env.GITHUB_API_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    "";
  if (fromEnv) return fromEnv;
  return readTokenFromGithubEnvFile();
}

export function isGithubServerTokenConfigured(): boolean {
  return getConfiguredGithubApiToken() != null;
}

/**
 * Pure selection order for GitHub API access:
 * workspace Settings PAT → env / machine-secret token.
 */
export function selectGithubAccessToken(sources: {
  workspaceToken: string | null;
  envToken: string | null;
}): string | null {
  if (sources.workspaceToken) return sources.workspaceToken;
  if (sources.envToken) return sources.envToken;
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
 * Prefer a workspace Settings PAT, then env / `~/.config/secrets/github.env`.
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

  return githubServiceError(
    "GitHub is not configured. Add a personal access token in Settings → GitHub (or set GITHUB_API_TOKEN / ~/.config/secrets/github.env).",
    "github_token_missing",
    403,
  );
}
