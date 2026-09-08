import type {
  GithubBranch,
  GithubCommit,
  GithubConnectionStatus,
  GithubOrganization,
  GithubPullRequest,
  GithubPullRequestFile,
  GithubRepository,
} from "@backsteros/contracts";
import { GITHUB_INTEGRATION_SCOPES } from "@backsteros/contracts";

const GITHUB_API = "https://api.github.com";
const COMMITS_PER_PAGE = 30;
const PULLS_PER_PAGE = 30;
const FILES_PER_PAGE = 100;
const REQUIRED_SCOPES = [...GITHUB_INTEGRATION_SCOPES];

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

type GithubFetchResult<T> = {
  body: T;
  linkHeader: string | null;
  oauthScopes: string[];
};

async function githubFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<GithubFetchResult<T>> {
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

  const oauthScopes = parseOAuthScopes(response.headers.get("x-oauth-scopes"));

  if (response.status === 401) {
    throw new GithubServiceError(
      "GitHub rejected the access token. Reconnect GitHub in Settings → Integrations → GitHub.",
      "github_unauthorized",
      401,
    );
  }
  if (response.status === 403) {
    throw new GithubServiceError(
      "GitHub access denied. Reconnect GitHub in Settings and grant repo + read:org scopes. Organization owners may also need to approve the OAuth app.",
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
  return {
    body,
    linkHeader: response.headers.get("link"),
    oauthScopes,
  };
}

function parseOAuthScopes(header: string | null): string[] {
  if (!header?.trim()) return [];
  return header
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function missingRequiredScopes(granted: string[]): string[] {
  const grantedSet = new Set(granted);
  return REQUIRED_SCOPES.filter((scope) => !grantedSet.has(scope));
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

type GithubApiPullRequestFile = {
  filename: string;
  previous_filename?: string | null;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string | null;
  blob_url?: string | null;
  raw_url?: string | null;
};

type GithubApiCommit = {
  sha: string;
  html_url: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
  };
  author?: { login?: string } | null;
  files?: GithubApiPullRequestFile[];
};

type GithubApiPullRequest = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  body?: string | null;
  html_url: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  merged_at?: string | null;
  commits?: number;
  comments?: number;
  changed_files?: number;
  additions?: number;
  deletions?: number;
  user?: { login?: string } | null;
  head?: { ref?: string };
  base?: { ref?: string };
};

type GithubApiOrg = {
  id: number;
  login: string;
  avatar_url?: string | null;
};

type GithubApiUser = {
  login: string;
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

function mapOrganization(row: GithubApiOrg): GithubOrganization {
  return {
    id: row.id,
    login: row.login,
    avatarUrl: row.avatar_url ?? null,
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

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapPullRequest(row: GithubApiPullRequest): GithubPullRequest {
  const mergedAt = toIsoOrNull(row.merged_at);
  const state =
    row.state === "open" ? "open" : mergedAt ? "merged" : "closed";
  const body = row.body?.trim() || null;
  return {
    number: row.number,
    title: row.title?.trim() || "(no title)",
    state,
    draft: Boolean(row.draft),
    body,
    authorLogin: row.user?.login?.trim() || null,
    createdAt: toIsoOrNull(row.created_at),
    updatedAt: toIsoOrNull(row.updated_at),
    closedAt: toIsoOrNull(row.closed_at),
    mergedAt,
    htmlUrl: row.html_url,
    headRef: row.head?.ref?.trim() || null,
    baseRef: row.base?.ref?.trim() || null,
    commitsCount:
      typeof row.commits === "number" && row.commits >= 0 ? row.commits : null,
    commentsCount:
      typeof row.comments === "number" && row.comments >= 0
        ? row.comments
        : null,
    changedFilesCount:
      typeof row.changed_files === "number" && row.changed_files >= 0
        ? row.changed_files
        : null,
    additions:
      typeof row.additions === "number" && row.additions >= 0
        ? row.additions
        : null,
    deletions:
      typeof row.deletions === "number" && row.deletions >= 0
        ? row.deletions
        : null,
  };
}

function mapPullRequestFile(row: GithubApiPullRequestFile): GithubPullRequestFile {
  return {
    filename: row.filename,
    previousFilename: row.previous_filename?.trim() || null,
    status: row.status,
    additions: Math.max(0, row.additions || 0),
    deletions: Math.max(0, row.deletions || 0),
    changes: Math.max(0, row.changes || 0),
    patch: row.patch?.length ? row.patch : null,
    blobUrl: row.blob_url?.trim() || null,
    rawUrl: row.raw_url?.trim() || null,
  };
}

function linkHasNext(linkHeader: string | null): boolean {
  if (!linkHeader) return false;
  return linkHeader.split(",").some((part) => part.includes('rel="next"'));
}

async function listPagedRepositories(
  token: string,
  pathPrefix: string,
  maxPages = 10,
): Promise<{ repositories: GithubRepository[]; oauthScopes: string[] }> {
  const repositories: GithubRepository[] = [];
  let oauthScopes: string[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = pathPrefix.includes("?") ? "&" : "?";
    const { body, linkHeader, oauthScopes: pageScopes } = await githubFetch<
      GithubApiRepo[]
    >(token, `${pathPrefix}${separator}per_page=100&page=${page}`);
    if (pageScopes.length > 0) {
      oauthScopes = pageScopes;
    }
    repositories.push(...body.map(mapRepository));
    if (!linkHasNext(linkHeader) || body.length === 0) {
      break;
    }
  }
  return { repositories, oauthScopes };
}

export async function listUserOrganizations(
  token: string,
): Promise<{ organizations: GithubOrganization[]; oauthScopes: string[] }> {
  const organizations: GithubOrganization[] = [];
  let oauthScopes: string[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { body, linkHeader, oauthScopes: pageScopes } = await githubFetch<
      GithubApiOrg[]
    >(token, `/user/orgs?per_page=100&page=${page}`);
    if (pageScopes.length > 0) {
      oauthScopes = pageScopes;
    }
    organizations.push(...body.map(mapOrganization));
    if (!linkHasNext(linkHeader) || body.length === 0) {
      break;
    }
  }
  organizations.sort((a, b) =>
    a.login.localeCompare(b.login, undefined, { sensitivity: "base" }),
  );
  return { organizations, oauthScopes };
}

/**
 * Personal repos plus org membership repos. Merges `/user/repos` (owner /
 * collaborator / organization_member) with explicit `/orgs/{org}/repos` so
 * organization repositories show up when the token has `read:org` + `repo`.
 */
export async function listUserRepositories(
  token: string,
): Promise<GithubRepository[]> {
  const byId = new Map<number, GithubRepository>();

  const affiliated = await listPagedRepositories(
    token,
    "/user/repos?sort=updated&affiliation=owner,collaborator,organization_member",
  );
  for (const repo of affiliated.repositories) {
    byId.set(repo.id, repo);
  }

  const { organizations } = await listUserOrganizations(token);
  for (const org of organizations) {
    try {
      const orgRepos = await listPagedRepositories(
        token,
        `/orgs/${encodeURIComponent(org.login)}/repos?type=all&sort=updated`,
      );
      for (const repo of orgRepos.repositories) {
        byId.set(repo.id, repo);
      }
    } catch (error) {
      // Org may require OAuth App approval; keep affiliated results.
      if (
        !(error instanceof GithubServiceError) ||
        (error.status !== 403 && error.status !== 404)
      ) {
        throw error;
      }
    }
  }

  const repositories = [...byId.values()];
  repositories.sort((a, b) =>
    a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }),
  );
  return repositories;
}

export function disconnectedGithubStatus(
  reason: string,
): GithubConnectionStatus {
  return {
    connected: false,
    login: null,
    scopes: [],
    requiredScopes: REQUIRED_SCOPES,
    missingScopes: [...REQUIRED_SCOPES],
    organizations: [],
    repositoryCount: null,
    reason,
  };
}

export async function getGithubConnectionStatus(
  token: string,
): Promise<GithubConnectionStatus> {
  try {
    const userResult = await githubFetch<GithubApiUser>(token, "/user");
    let scopes = userResult.oauthScopes;

    let organizations: GithubOrganization[] = [];
    try {
      const orgResult = await listUserOrganizations(token);
      organizations = orgResult.organizations;
      if (orgResult.oauthScopes.length > 0) {
        scopes = orgResult.oauthScopes;
      }
    } catch (error) {
      if (
        !(error instanceof GithubServiceError) ||
        (error.status !== 403 && error.status !== 401)
      ) {
        throw error;
      }
    }

    const missingScopes = missingRequiredScopes(scopes);

    let repositoryCount: number | null = null;
    try {
      const firstPage = await githubFetch<GithubApiRepo[]>(
        token,
        "/user/repos?per_page=100&page=1&sort=updated&affiliation=owner,collaborator,organization_member",
      );
      repositoryCount = firstPage.body.length;
      if (linkHasNext(firstPage.linkHeader)) {
        repositoryCount = firstPage.body.length;
      }
    } catch {
      repositoryCount = null;
    }

    const reasonParts: string[] = [];
    if (missingScopes.length > 0) {
      reasonParts.push(
        `Missing OAuth scopes: ${missingScopes.join(", ")}. Reconnect GitHub to grant them.`,
      );
    }
    if (organizations.length === 0 && !missingScopes.includes("read:org")) {
      reasonParts.push(
        "No organizations returned. If you expect org repos, ask an org owner to approve the OAuth app under GitHub → Settings → Third-party access.",
      );
    }

    return {
      connected: true,
      login: userResult.body.login,
      scopes,
      requiredScopes: REQUIRED_SCOPES,
      missingScopes,
      organizations,
      repositoryCount,
      reason: reasonParts.length > 0 ? reasonParts.join(" ") : null,
    };
  } catch (error) {
    if (error instanceof GithubServiceError) {
      return disconnectedGithubStatus(error.message);
    }
    throw error;
  }
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

export async function getRepositoryCommit(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ commit: GithubCommit; files: GithubPullRequestFile[] }> {
  const { body } = await githubFetch<GithubApiCommit>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`,
  );
  return {
    commit: mapCommit(body),
    files: (body.files ?? []).map(mapPullRequestFile),
  };
}

export async function listRepositoryPullRequestCommits(
  token: string,
  owner: string,
  repo: string,
  number: number,
  options?: { page?: number; perPage?: number },
): Promise<{ commits: GithubCommit[]; hasMore: boolean; page: number }> {
  const page = options?.page && options.page > 0 ? options.page : 1;
  const perPage = options?.perPage ?? COMMITS_PER_PAGE;
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  const { body, linkHeader } = await githubFetch<GithubApiCommit[]>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(number))}/commits?${query.toString()}`,
  );
  return {
    commits: body.map(mapCommit),
    hasMore: linkHasNext(linkHeader),
    page,
  };
}

export async function listRepositoryPullRequests(
  token: string,
  owner: string,
  repo: string,
  options?: { page?: number; perPage?: number },
): Promise<{
  pullRequests: GithubPullRequest[];
  hasMore: boolean;
  page: number;
}> {
  const page = options?.page && options.page > 0 ? options.page : 1;
  const perPage = options?.perPage ?? PULLS_PER_PAGE;
  const query = new URLSearchParams({
    state: "all",
    sort: "updated",
    direction: "desc",
    page: String(page),
    per_page: String(perPage),
  });
  const { body, linkHeader } = await githubFetch<GithubApiPullRequest[]>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${query.toString()}`,
  );
  return {
    pullRequests: body.map(mapPullRequest),
    hasMore: linkHasNext(linkHeader),
    page,
  };
}

export async function getRepositoryPullRequest(
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<GithubPullRequest> {
  const { body } = await githubFetch<GithubApiPullRequest>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(number))}`,
  );
  return mapPullRequest(body);
}

export async function listRepositoryPullRequestFiles(
  token: string,
  owner: string,
  repo: string,
  number: number,
  options?: { page?: number; perPage?: number },
): Promise<{ files: GithubPullRequestFile[]; hasMore: boolean; page: number }> {
  const page = options?.page && options.page > 0 ? options.page : 1;
  const perPage = options?.perPage ?? FILES_PER_PAGE;
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  const { body, linkHeader } = await githubFetch<GithubApiPullRequestFile[]>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(number))}/files?${query.toString()}`,
  );
  return {
    files: body.map(mapPullRequestFile),
    hasMore: linkHasNext(linkHeader),
    page,
  };
}

export {
  COMMITS_PER_PAGE,
  FILES_PER_PAGE,
  PULLS_PER_PAGE,
  REQUIRED_SCOPES as GITHUB_REQUIRED_SCOPES,
};
