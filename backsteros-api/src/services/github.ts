import type {
  GithubBranch,
  GithubCommit,
  GithubRepository,
} from "@backsteros/contracts";

import { clerkClient } from "../middleware/auth.js";

const GITHUB_API = "https://api.github.com";
const COMMITS_PER_PAGE = 30;

export class GithubServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 502,
  ) {
    super(message);
    this.name = "GithubServiceError";
  }
}

export function parseGithubRepositoryFullName(fullName: string): {
  owner: string;
  repo: string;
} {
  const [owner, repo, ...rest] = fullName.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new GithubServiceError(
      "Invalid GitHub repository name",
      "invalid_github_repository",
      400,
    );
  }
  return { owner, repo };
}

export async function getGithubAccessToken(
  clerkUserId: string,
): Promise<string> {
  let response: Awaited<
    ReturnType<typeof clerkClient.users.getUserOauthAccessToken>
  >;
  try {
    response = await clerkClient.users.getUserOauthAccessToken(
      clerkUserId,
      "github",
    );
  } catch {
    throw new GithubServiceError(
      "Could not load GitHub access from Clerk. Reconnect GitHub on your account.",
      "github_oauth_unavailable",
      403,
    );
  }

  const token = response.data[0]?.token?.trim();
  if (!token) {
    throw new GithubServiceError(
      "No GitHub OAuth token. Sign in with GitHub (or reconnect it) and ensure the Clerk connection includes repo scopes.",
      "github_oauth_missing",
      403,
    );
  }
  return token;
}

async function githubFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ body: T; linkHeader: string | null }> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "backsteros-api",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    throw new GithubServiceError(
      "GitHub rejected the access token. Reconnect GitHub in your account settings.",
      "github_unauthorized",
      401,
    );
  }
  if (response.status === 403) {
    throw new GithubServiceError(
      "GitHub access denied. Your Clerk GitHub connection may need the repo scope — reconnect GitHub after updating scopes.",
      "github_forbidden",
      403,
    );
  }
  if (response.status === 404) {
    throw new GithubServiceError(
      "GitHub resource not found",
      "github_not_found",
      404,
    );
  }
  if (!response.ok) {
    throw new GithubServiceError(
      `GitHub request failed (${response.status})`,
      "github_upstream_error",
      502,
    );
  }

  const body = (await response.json()) as T;
  return { body, linkHeader: response.headers.get("link") };
}

type GithubApiRepo = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  owner?: { login?: string };
};

type GithubApiBranch = {
  name: string;
  protected?: boolean;
  commit?: { sha?: string };
};

type GithubApiCommit = {
  sha: string;
  html_url: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
  };
  author?: { login?: string } | null;
};

function mapRepository(row: GithubApiRepo): GithubRepository {
  return {
    id: row.id,
    fullName: row.full_name,
    name: row.name,
    ownerLogin: row.owner?.login ?? row.full_name.split("/")[0]!,
    private: row.private,
    defaultBranch: row.default_branch,
    htmlUrl: row.html_url,
    description: row.description,
  };
}

function mapBranch(row: GithubApiBranch): GithubBranch {
  return {
    name: row.name,
    protected: Boolean(row.protected),
    commitSha: row.commit?.sha ?? null,
  };
}

function mapCommit(row: GithubApiCommit): GithubCommit {
  const message = row.commit?.message?.trim() || "(no message)";
  const authoredAt = row.commit?.author?.date
    ? new Date(row.commit.author.date).toISOString()
    : null;
  return {
    sha: row.sha,
    shortSha: row.sha.slice(0, 7),
    message,
    authorName: row.commit?.author?.name?.trim() || null,
    authorLogin: row.author?.login?.trim() || null,
    authoredAt,
    htmlUrl: row.html_url,
  };
}

function linkHasNext(linkHeader: string | null): boolean {
  if (!linkHeader) return false;
  return linkHeader.split(",").some((part) => part.includes('rel="next"'));
}

export async function listUserRepositories(
  token: string,
): Promise<GithubRepository[]> {
  const repositories: GithubRepository[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { body, linkHeader } = await githubFetch<GithubApiRepo[]>(
      token,
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
    );
    repositories.push(...body.map(mapRepository));
    if (!linkHasNext(linkHeader) || body.length === 0) {
      break;
    }
  }
  repositories.sort((a, b) =>
    a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }),
  );
  return repositories;
}

export async function getRepository(
  token: string,
  owner: string,
  repo: string,
): Promise<GithubRepository> {
  const { body } = await githubFetch<GithubApiRepo>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  return mapRepository(body);
}

export async function listRepositoryBranches(
  token: string,
  owner: string,
  repo: string,
): Promise<GithubBranch[]> {
  const branches: GithubBranch[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { body, linkHeader } = await githubFetch<GithubApiBranch[]>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`,
    );
    branches.push(...body.map(mapBranch));
    if (!linkHasNext(linkHeader) || body.length === 0) {
      break;
    }
  }
  return branches;
}

export async function listRepositoryCommits(
  token: string,
  owner: string,
  repo: string,
  options: { sha: string; page?: number; perPage?: number },
): Promise<{ commits: GithubCommit[]; hasMore: boolean; page: number }> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const perPage = options.perPage ?? COMMITS_PER_PAGE;
  const query = new URLSearchParams({
    sha: options.sha,
    page: String(page),
    per_page: String(perPage),
  });
  const { body, linkHeader } = await githubFetch<GithubApiCommit[]>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${query.toString()}`,
  );
  return {
    commits: body.map(mapCommit),
    hasMore: linkHasNext(linkHeader),
    page,
  };
}

export { COMMITS_PER_PAGE };
