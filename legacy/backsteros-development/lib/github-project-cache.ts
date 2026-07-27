import type {
  GithubBranch,
  GithubCommit,
  GithubPullRequest,
  GithubRepository,
} from "@backsteros/contracts";

export type GithubBranchesPayload = {
  repository: string | null;
  defaultBranch: string | null;
  branches: GithubBranch[];
};

export type GithubCommitsCache = {
  commits: GithubCommit[];
  page: number;
  hasMore: boolean;
};

export type GithubPullRequestsCache = {
  pullRequests: GithubPullRequest[];
  page: number;
  hasMore: boolean;
};

let repositoriesCache: GithubRepository[] | null = null;

const branchesCache = new Map<string, GithubBranchesPayload>();
const selectedBranchCache = new Map<string, string | null>();
const commitsCache = new Map<string, GithubCommitsCache>();
const pullRequestsCache = new Map<string, GithubPullRequestsCache>();

export function branchesCacheKey(
  projectId: string,
  repository: string | null | undefined,
): string {
  return `${projectId}\0${repository ?? ""}`;
}

export function commitsCacheKey(
  projectId: string,
  repository: string | null | undefined,
  branch: string | null | undefined,
): string {
  return `${projectId}\0${repository ?? ""}\0${branch ?? ""}`;
}

export function pullRequestsCacheKey(
  projectId: string,
  repository: string | null | undefined,
): string {
  return `${projectId}\0${repository ?? ""}`;
}

export function getCachedRepositories(): GithubRepository[] | null {
  return repositoriesCache;
}

export function setCachedRepositories(repositories: GithubRepository[]): void {
  repositoriesCache = repositories;
}

export function getCachedBranches(
  projectId: string,
  repository: string | null | undefined,
): GithubBranchesPayload | null {
  return branchesCache.get(branchesCacheKey(projectId, repository)) ?? null;
}

export function setCachedBranches(
  projectId: string,
  repository: string | null | undefined,
  payload: GithubBranchesPayload,
): void {
  branchesCache.set(branchesCacheKey(projectId, repository), payload);
}

export function getCachedSelectedBranch(
  projectId: string,
  repository: string | null | undefined,
): string | null | undefined {
  const key = branchesCacheKey(projectId, repository);
  if (!selectedBranchCache.has(key)) return undefined;
  return selectedBranchCache.get(key) ?? null;
}

export function setCachedSelectedBranch(
  projectId: string,
  repository: string | null | undefined,
  branch: string | null,
): void {
  selectedBranchCache.set(branchesCacheKey(projectId, repository), branch);
}

export function getCachedCommits(
  projectId: string,
  repository: string | null | undefined,
  branch: string | null | undefined,
): GithubCommitsCache | null {
  if (!branch) return null;
  return commitsCache.get(commitsCacheKey(projectId, repository, branch)) ?? null;
}

export function setCachedCommits(
  projectId: string,
  repository: string | null | undefined,
  branch: string | null | undefined,
  value: GithubCommitsCache,
): void {
  if (!branch) return;
  commitsCache.set(commitsCacheKey(projectId, repository, branch), value);
}

export function getCachedPullRequests(
  projectId: string,
  repository: string | null | undefined,
): GithubPullRequestsCache | null {
  if (!repository) return null;
  return (
    pullRequestsCache.get(pullRequestsCacheKey(projectId, repository)) ?? null
  );
}

export function setCachedPullRequests(
  projectId: string,
  repository: string | null | undefined,
  value: GithubPullRequestsCache,
): void {
  if (!repository) return;
  pullRequestsCache.set(pullRequestsCacheKey(projectId, repository), value);
}
