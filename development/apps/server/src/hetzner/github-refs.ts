/**
 * List GitHub branches (and tags) for WordPress component ref pickers.
 * Auth: GITHUB_TOKEN / GH_TOKEN, ~/.config/secrets/github.env, or `gh auth token`.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GithubRefList = {
  readonly repository: string;
  readonly defaultBranch: string | null;
  readonly branches: readonly string[];
  readonly tags: readonly string[];
};

function normalizeRepo(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//iu, "")
    .replace(/\.git$/iu, "")
    .replace(/^git@github\.com:/iu, "")
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "");
}

function resolveGithubTokenFromFile(): string {
  try {
    const filePath = path.join(os.homedir(), ".config", "secrets", "github.env");
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = /^(?:export\s+)?(?:GITHUB_TOKEN|GH_TOKEN)=(.+)$/u.exec(line.trim());
      if (!match) continue;
      return match[1]!.trim().replace(/^['"]|['"]$/gu, "");
    }
  } catch {
    // Fall through.
  }
  return "";
}

async function resolveGithubToken(): Promise<string> {
  const fromEnv = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || "";
  if (fromEnv) return fromEnv;
  const fromFile = resolveGithubTokenFromFile();
  if (fromFile) return fromFile;
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], {
      timeout: 8_000,
      maxBuffer: 64 * 1024,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function githubJson<T>(token: string, apiPath: string): Promise<T> {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "BacksterOS-Forge",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ${response.status}: ${text.slice(0, 200) || response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function listGithubRepoRefs(repoInput: string): Promise<GithubRefList> {
  const repository = normalizeRepo(repoInput);
  const parts = repository.split("/");
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo || parts.length !== 2) {
    throw new Error("repo must be owner/name");
  }
  const token = await resolveGithubToken();
  if (!token) {
    throw new Error(
      "GitHub token missing (GITHUB_TOKEN, ~/.config/secrets/github.env, or gh auth)",
    );
  }

  const [repoInfo, branchPages, tagPages] = await Promise.all([
    githubJson<{ readonly default_branch?: string }>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    ),
    githubJson<readonly { readonly name: string }[]>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
    ),
    githubJson<readonly { readonly name: string }[]>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=40`,
    ),
  ]);

  return {
    repository,
    defaultBranch: repoInfo.default_branch?.trim() || null,
    branches: branchPages.map((entry) => entry.name).filter(Boolean),
    tags: tagPages.map((entry) => entry.name).filter(Boolean),
  };
}
