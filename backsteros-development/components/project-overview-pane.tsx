"use client";

import type {
  GithubBranch,
  GithubCommit,
  GithubPullRequest,
  GithubPullRequestState,
  GithubRepository,
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  ComposeFolderIcon,
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  OverviewNameEditor,
  ProjectPanelDetailView,
  ProjectPanelOverviewSkeleton,
  ProjectOcticon,
  ProjectOverviewIcon,
  PropertyDropdown,
  SegmentedPillToggle,
  buildOrganizationDropdownOptions,
  keyboardNavItemProps,
  keyboardNavListItemClass,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  type ProjectArea,
  type ProjectStatus,
  type SearchableDropdownOption,
} from "@backsteros/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DirectoryPickerModal } from "@/components/directory-picker-modal";
import { GithubCommitIcon } from "@/components/github-commit-icon";
import { GithubPullRequestIcon } from "@/components/github-pull-request-icon";
import { ProjectsSidePanelIcon } from "@/components/panel-icons";
import {
  apiErrorMessage,
  useApiResource,
  useConsoleApi,
} from "@/lib/api-context";
import {
  getCachedBranches,
  getCachedCommits,
  getCachedPullRequests,
  getCachedRepositories,
  getCachedSelectedBranch,
  setCachedBranches,
  setCachedCommits,
  setCachedPullRequests,
  setCachedRepositories,
  setCachedSelectedBranch,
  type GithubBranchesPayload,
} from "@/lib/github-project-cache";
import { normalizeWorkingDirectory } from "@/lib/project-workspace";

const NONE_REPO_VALUE = "__none__";

type GithubListTab = "commits" | "pulls";

const GITHUB_LIST_TAB_OPTIONS = [
  { value: "commits" as const, label: "Commits" },
  { value: "pulls" as const, label: "PRs" },
];

function pullRequestStateLabel(
  state: GithubPullRequestState,
  draft: boolean,
): string {
  if (state === "open" && draft) return "Draft";
  if (state === "open") return "Open";
  if (state === "merged") return "Merged";
  return "Closed";
}

function mapProjectForDetail(
  project: ApiProject,
  taskProgress: { total: number; completed: number },
) {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    status: project.status,
    priority: project.priority,
    area: project.area,
    type: project.type,
    icon: project.icon,
    organizationId: project.organizationId,
    summary: project.summary,
    description: project.description,
    startDate: project.startDate ? new Date(project.startDate) : null,
    dueDate: project.dueDate ? new Date(project.dueDate) : null,
    taskProgress,
  };
}

/** Compact relative age for list trailing column (e.g. 5m, 3h, 2d). */
function formatRelativeAge(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

function commitSubject(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  return line || "(no message)";
}

function workingDirectoryLabel(path: string): string {
  const trimmed = path.replace(/\/+$/, "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const parts = trimmed.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

function ProjectWorkingDirectoryField({
  project,
  onProjectUpdated,
}: {
  project: ApiProject;
  onProjectUpdated: (project: ApiProject) => void;
}) {
  const { client } = useConsoleApi();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const directory = normalizeWorkingDirectory(project.localWorkingDirectory);

  useEffect(() => {
    setPickerOpen(false);
  }, [project.id]);

  const hasDirectory = Boolean(directory);
  const label = hasDirectory
    ? workingDirectoryLabel(directory!)
    : "Set folder…";

  return (
    <>
      <button
        type="button"
        className={[
          "property-dropdown-trigger",
          "property-dropdown-trigger--inline-chip",
          hasDirectory ? null : "is-muted",
        ]
          .filter(Boolean)
          .join(" ")}
        title={
          directory ??
          "Choose working directory (required before starting an agent)"
        }
        aria-label={
          hasDirectory
            ? `Working directory: ${directory}`
            : "Choose working directory (required before starting an agent)"
        }
        disabled={saving}
        onClick={() => setPickerOpen(true)}
      >
        <span className="property-dropdown-trigger__icon" aria-hidden="true">
          <ComposeFolderIcon className="" />
        </span>
        <span className="property-dropdown-trigger__label">{label}</span>
      </button>

      <DirectoryPickerModal
        open={pickerOpen}
        initialPath={directory}
        onClose={() => setPickerOpen(false)}
        onSelect={(next) => {
          setPickerOpen(false);
          setSaving(true);
          void (async () => {
            try {
              const updated = await client.requestJson<ApiProject>(
                `/api/v1/projects/${encodeURIComponent(project.id)}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ localWorkingDirectory: next }),
                },
              );
              onProjectUpdated(updated);
            } finally {
              setSaving(false);
            }
          })();
        }}
      />
    </>
  );
}

function ProjectCommitHistory({
  project,
  onProjectUpdated,
  githubListTab,
  onGithubListTabChange,
  selectedCommitSha,
  onSelectCommit,
  selectedPullNumber,
  onSelectPullRequest,
}: {
  project: ApiProject;
  onProjectUpdated: (project: ApiProject) => void;
  githubListTab: GithubListTab;
  onGithubListTabChange?: (tab: GithubListTab) => void;
  selectedCommitSha?: string | null;
  onSelectCommit?: (commit: GithubCommit, repository: string) => void;
  selectedPullNumber?: number | null;
  onSelectPullRequest?: (
    pullRequest: GithubPullRequest,
    repository: string,
  ) => void;
}) {
  const { client } = useConsoleApi();
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const cachedSelectedBranch = getCachedSelectedBranch(
    project.id,
    project.githubRepository,
  );
  const cachedCommits = getCachedCommits(
    project.id,
    project.githubRepository,
    cachedSelectedBranch ?? null,
  );
  const [selectedBranch, setSelectedBranch] = useState<string | null>(
    () => cachedSelectedBranch ?? null,
  );
  const [commits, setCommits] = useState<GithubCommit[]>(
    () => cachedCommits?.commits ?? [],
  );
  const [commitsPage, setCommitsPage] = useState(
    () => cachedCommits?.page ?? 1,
  );
  const [commitsHasMore, setCommitsHasMore] = useState(
    () => cachedCommits?.hasMore ?? false,
  );
  const [commitsLoading, setCommitsLoading] = useState(
    () => !cachedCommits && Boolean(project.githubRepository),
  );
  const [commitsLoadingMore, setCommitsLoadingMore] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const listTab = githubListTab;
  const cachedPullRequests = getCachedPullRequests(
    project.id,
    project.githubRepository,
  );
  const [pullRequests, setPullRequests] = useState<GithubPullRequest[]>(
    () => cachedPullRequests?.pullRequests ?? [],
  );
  const [pullsPage, setPullsPage] = useState(
    () => cachedPullRequests?.page ?? 1,
  );
  const [pullsHasMore, setPullsHasMore] = useState(
    () => cachedPullRequests?.hasMore ?? false,
  );
  const [pullsLoading, setPullsLoading] = useState(
    () => !cachedPullRequests && Boolean(project.githubRepository),
  );
  const [pullsLoadingMore, setPullsLoadingMore] = useState(false);
  const [pullsError, setPullsError] = useState<string | null>(null);
  const commitsRequestGenerationRef = useRef(0);
  const pullsRequestGenerationRef = useRef(0);
  const loadedCommitsKeyRef = useRef<string | null>(
    cachedCommits
      ? `${project.id}\0${project.githubRepository ?? ""}\0${cachedSelectedBranch ?? ""}`
      : null,
  );
  const loadedPullsKeyRef = useRef<string | null>(
    cachedPullRequests
      ? `${project.id}\0${project.githubRepository ?? ""}`
      : null,
  );

  const loadRepositories = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      const cached = getCachedRepositories();
      if (cached) return cached;
      const result = await api.requestJson<{
        repositories: GithubRepository[];
      }>("/api/v1/github/repositories", { signal });
      setCachedRepositories(result.repositories);
      return result.repositories;
    },
    [],
  );

  const {
    data: repositories,
    error: repositoriesError,
    loading: repositoriesLoading,
  } = useApiResource(loadRepositories, [project.id]);

  useEffect(() => {
    if (repositories) setCachedRepositories(repositories);
  }, [repositories]);

  const repositoryOptions = useMemo((): SearchableDropdownOption<string>[] => {
    const repoIcon = <ProjectOcticon icon="mark-github" size={14} />;
    const rows = (repositories ?? getCachedRepositories() ?? []).map(
      (repo) => ({
        value: repo.fullName,
        label: repo.fullName,
        searchTerms: `${repo.fullName} ${repo.description ?? ""}`,
        icon: repoIcon,
      }),
    );
    return [
      {
        value: NONE_REPO_VALUE,
        label: "No repository",
        searchTerms: "none clear unlink",
        icon: repoIcon,
      },
      ...rows,
    ];
  }, [repositories]);

  const saveGithubRepository = useCallback(
    async (fullName: string | null) => {
      setRepoSaving(true);
      setRepoError(null);
      try {
        const updated = await client.requestJson<ApiProject>(
          `/api/v1/projects/${encodeURIComponent(project.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ githubRepository: fullName }),
          },
        );
        onProjectUpdated(updated);
      } catch (error) {
        setRepoError(apiErrorMessage(error));
      } finally {
        setRepoSaving(false);
      }
    },
    [client, onProjectUpdated, project.id],
  );

  const loadBranches = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      if (!project.githubRepository) {
        return {
          repository: null as string | null,
          defaultBranch: null as string | null,
          branches: [] as GithubBranch[],
        } satisfies GithubBranchesPayload;
      }
      const cached = getCachedBranches(project.id, project.githubRepository);
      if (cached) return cached;
      const payload = await api.requestJson<GithubBranchesPayload>(
        `/api/v1/projects/${encodeURIComponent(project.id)}/github/branches`,
        { signal },
      );
      setCachedBranches(project.id, project.githubRepository, payload);
      return payload;
    },
    [project.githubRepository, project.id],
  );

  const {
    data: branchPayload,
    error: branchesError,
    loading: branchesLoading,
  } = useApiResource(loadBranches, [
    project.id,
    project.githubRepository ?? "",
  ]);

  useEffect(() => {
    if (branchPayload && project.githubRepository) {
      setCachedBranches(project.id, project.githubRepository, branchPayload);
    }
  }, [branchPayload, project.githubRepository, project.id]);

  const resolvedBranchPayload =
    branchPayload ??
    getCachedBranches(project.id, project.githubRepository) ??
    null;

  useEffect(() => {
    commitsRequestGenerationRef.current += 1;
    pullsRequestGenerationRef.current += 1;
    loadedCommitsKeyRef.current = null;
    loadedPullsKeyRef.current = null;
    const nextSelected =
      getCachedSelectedBranch(project.id, project.githubRepository) ?? null;
    const nextCommits = getCachedCommits(
      project.id,
      project.githubRepository,
      nextSelected,
    );
    const nextPulls = getCachedPullRequests(
      project.id,
      project.githubRepository,
    );
    setSelectedBranch(nextSelected);
    setCommits(nextCommits?.commits ?? []);
    setCommitsPage(nextCommits?.page ?? 1);
    setCommitsHasMore(nextCommits?.hasMore ?? false);
    setCommitsLoading(false);
    setCommitsError(null);
    setPullRequests(nextPulls?.pullRequests ?? []);
    setPullsPage(nextPulls?.page ?? 1);
    setPullsHasMore(nextPulls?.hasMore ?? false);
    setPullsLoading(false);
    setPullsError(null);
    setRepoError(null);
    if (nextCommits && nextSelected) {
      loadedCommitsKeyRef.current = `${project.id}\0${project.githubRepository ?? ""}\0${nextSelected}`;
    }
    if (nextPulls && project.githubRepository) {
      loadedPullsKeyRef.current = `${project.id}\0${project.githubRepository}`;
    }
  }, [project.id, project.githubRepository]);

  useEffect(() => {
    if (!resolvedBranchPayload?.branches.length) return;
    if (
      project.githubRepository &&
      resolvedBranchPayload.repository !== project.githubRepository
    ) {
      return;
    }
    setSelectedBranch((current) => {
      if (
        current &&
        resolvedBranchPayload.branches.some((b) => b.name === current)
      ) {
        return current;
      }
      if (
        resolvedBranchPayload.defaultBranch &&
        resolvedBranchPayload.branches.some(
          (b) => b.name === resolvedBranchPayload.defaultBranch,
        )
      ) {
        return resolvedBranchPayload.defaultBranch;
      }
      return resolvedBranchPayload.branches[0]?.name ?? null;
    });
  }, [resolvedBranchPayload, project.githubRepository]);

  useEffect(() => {
    setCachedSelectedBranch(
      project.id,
      project.githubRepository,
      selectedBranch,
    );
  }, [project.githubRepository, project.id, selectedBranch]);

  const loadCommitsPage = useCallback(
    async (branch: string, page: number, append: boolean) => {
      const requestGeneration = commitsRequestGenerationRef.current;
      if (append) {
        setCommitsLoadingMore(true);
      } else {
        setCommitsLoading(true);
        setCommits([]);
      }
      setCommitsError(null);
      try {
        const query = new URLSearchParams({
          branch,
          page: String(page),
        });
        const result = await client.requestJson<{
          commits: GithubCommit[];
          page: number;
          hasMore: boolean;
        }>(
          `/api/v1/projects/${encodeURIComponent(project.id)}/github/commits?${query.toString()}`,
        );
        if (requestGeneration !== commitsRequestGenerationRef.current) {
          return;
        }
        setCommits((previous) => {
          const next = append
            ? [...previous, ...result.commits]
            : result.commits;
          setCachedCommits(project.id, project.githubRepository, branch, {
            commits: next,
            page: result.page,
            hasMore: result.hasMore,
          });
          return next;
        });
        setCommitsPage(result.page);
        setCommitsHasMore(result.hasMore);
        loadedCommitsKeyRef.current = `${project.id}\0${project.githubRepository ?? ""}\0${branch}`;
      } catch (error) {
        if (requestGeneration !== commitsRequestGenerationRef.current) {
          return;
        }
        setCommitsError(apiErrorMessage(error));
        if (!append) {
          setCommits([]);
          setCommitsHasMore(false);
        }
      } finally {
        if (requestGeneration === commitsRequestGenerationRef.current) {
          setCommitsLoading(false);
          setCommitsLoadingMore(false);
        }
      }
    },
    [client, project.githubRepository, project.id],
  );

  const loadPullsPage = useCallback(
    async (page: number, append: boolean) => {
      if (!project.githubRepository) return;
      const requestGeneration = pullsRequestGenerationRef.current;
      if (append) {
        setPullsLoadingMore(true);
      } else {
        setPullsLoading(true);
        setPullRequests([]);
      }
      setPullsError(null);
      try {
        const query = new URLSearchParams({
          page: String(page),
        });
        const result = await client.requestJson<{
          pullRequests: GithubPullRequest[];
          page: number;
          hasMore: boolean;
        }>(
          `/api/v1/projects/${encodeURIComponent(project.id)}/github/pulls?${query.toString()}`,
        );
        if (requestGeneration !== pullsRequestGenerationRef.current) {
          return;
        }
        setPullRequests((previous) => {
          const next = append
            ? [...previous, ...result.pullRequests]
            : result.pullRequests;
          setCachedPullRequests(project.id, project.githubRepository, {
            pullRequests: next,
            page: result.page,
            hasMore: result.hasMore,
          });
          return next;
        });
        setPullsPage(result.page);
        setPullsHasMore(result.hasMore);
        loadedPullsKeyRef.current = `${project.id}\0${project.githubRepository}`;
      } catch (error) {
        if (requestGeneration !== pullsRequestGenerationRef.current) {
          return;
        }
        setPullsError(apiErrorMessage(error));
        if (!append) {
          setPullRequests([]);
          setPullsHasMore(false);
        }
      } finally {
        if (requestGeneration === pullsRequestGenerationRef.current) {
          setPullsLoading(false);
          setPullsLoadingMore(false);
        }
      }
    },
    [client, project.githubRepository, project.id],
  );

  useEffect(() => {
    if (!project.githubRepository || !selectedBranch) return;
    if (
      !resolvedBranchPayload ||
      resolvedBranchPayload.repository !== project.githubRepository ||
      !resolvedBranchPayload.branches.some((b) => b.name === selectedBranch)
    ) {
      return;
    }
    const key = `${project.id}\0${project.githubRepository}\0${selectedBranch}`;
    if (loadedCommitsKeyRef.current === key && commits.length > 0) {
      return;
    }
    const cached = getCachedCommits(
      project.id,
      project.githubRepository,
      selectedBranch,
    );
    if (cached) {
      setCommits(cached.commits);
      setCommitsPage(cached.page);
      setCommitsHasMore(cached.hasMore);
      setCommitsLoading(false);
      loadedCommitsKeyRef.current = key;
      return;
    }
    void loadCommitsPage(selectedBranch, 1, false);
  }, [
    commits.length,
    loadCommitsPage,
    project.githubRepository,
    project.id,
    resolvedBranchPayload,
    selectedBranch,
  ]);

  useEffect(() => {
    if (!project.githubRepository || listTab !== "pulls") return;
    const key = `${project.id}\0${project.githubRepository}`;
    if (loadedPullsKeyRef.current === key && pullRequests.length > 0) {
      return;
    }
    const cached = getCachedPullRequests(project.id, project.githubRepository);
    if (cached) {
      setPullRequests(cached.pullRequests);
      setPullsPage(cached.page);
      setPullsHasMore(cached.hasMore);
      setPullsLoading(false);
      loadedPullsKeyRef.current = key;
      return;
    }
    void loadPullsPage(1, false);
  }, [
    listTab,
    loadPullsPage,
    project.githubRepository,
    project.id,
    pullRequests.length,
  ]);

  const branchOptions = useMemo((): SearchableDropdownOption<string>[] => {
    return (resolvedBranchPayload?.branches ?? []).map((branch) => ({
      value: branch.name,
      label: branch.name,
      searchTerms: branch.name,
      icon: <ProjectOcticon icon="git-branch" size={14} />,
    }));
  }, [resolvedBranchPayload?.branches]);

  const showRepositoriesLoading =
    repositoriesLoading && !repositories && !getCachedRepositories();
  const showBranchesLoading =
    Boolean(project.githubRepository) &&
    branchesLoading &&
    !resolvedBranchPayload;

  const githubListRef = useRef<HTMLUListElement>(null);
  const githubListContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_CONTENT,
  );
  const githubItemIds = useMemo(
    () =>
      listTab === "commits"
        ? commits.map((commit) => commit.sha)
        : pullRequests.map((pull) => String(pull.number)),
    [commits, listTab, pullRequests],
  );
  const githubSelectedId =
    listTab === "commits"
      ? (selectedCommitSha ?? null)
      : selectedPullNumber != null
        ? String(selectedPullNumber)
        : null;
  const navigateGithubItem = useCallback(
    (itemId: string) => {
      if (!project.githubRepository) return;
      if (listTab === "commits") {
        const commit = commits.find((entry) => entry.sha === itemId);
        if (commit) onSelectCommit?.(commit, project.githubRepository);
        return;
      }
      const pull = pullRequests.find(
        (entry) => String(entry.number) === itemId,
      );
      if (pull) onSelectPullRequest?.(pull, project.githubRepository);
    },
    [
      commits,
      listTab,
      onSelectCommit,
      onSelectPullRequest,
      project.githubRepository,
      pullRequests,
    ],
  );
  const { highlightedId: githubHighlightedId } = useListKeyboardNavigation({
    containerRef: githubListRef,
    itemIds: githubItemIds,
    selectedId: githubSelectedId,
    onNavigate: navigateGithubItem,
    zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
    enabled: Boolean(project.githubRepository) && githubItemIds.length > 0,
  });
  const { setActiveZone } = useListKeyboardNavigationZone();
  const previousGithubListTabRef = useRef(listTab);
  useEffect(() => {
    const tabChanged = previousGithubListTabRef.current !== listTab;
    previousGithubListTabRef.current = listTab;
    if (!tabChanged || githubItemIds.length === 0) return;
    setActiveZone("content", { activate: true });
  }, [githubItemIds.length, listTab, setActiveZone]);

  return (
    <div className="project-panel-repositories">
      <div className="console-github-pane-toolbar project-details-github-toolbar">
        <div className="project-github-repo-chip">
          <PropertyDropdown
            ariaLabel="GitHub repository"
            value={project.githubRepository ?? NONE_REPO_VALUE}
            options={repositoryOptions}
            disabled={repoSaving || showRepositoriesLoading}
            searchPlaceholder="Search repositories…"
            panelWidth={320}
            panelAlign="start"
            triggerVariant="inlineChip"
            fallbackIcon={<ProjectOcticon icon="mark-github" size={14} />}
            fallbackLabel="Select repository…"
            mutedFallback
            mutedSelected={!project.githubRepository}
            onChange={(value) => {
              void saveGithubRepository(
                value === NONE_REPO_VALUE ? null : value,
              );
            }}
          />
        </div>
        {project.githubRepository ? (
          <div className="project-github-branch-chip">
            <PropertyDropdown
              ariaLabel="Git branch"
              value={selectedBranch}
              options={branchOptions}
              disabled={showBranchesLoading || branchOptions.length === 0}
              searchPlaceholder="Search branches…"
              panelWidth={260}
              panelAlign="start"
              triggerVariant="inlineChip"
              fallbackIcon={<ProjectOcticon icon="git-branch" size={14} />}
              fallbackLabel="Select branch…"
              mutedFallback
              onChange={(value) => {
                setSelectedBranch(value);
                setCachedSelectedBranch(
                  project.id,
                  project.githubRepository,
                  value,
                );
                loadedCommitsKeyRef.current = null;
              }}
            />
          </div>
        ) : null}
      </div>
      {repositoriesError ? (
        <p className="console-github-pane-error" role="alert">
          {apiErrorMessage(repositoriesError)}
        </p>
      ) : null}
      {repoError ? (
        <p className="console-github-pane-error" role="alert">
          {repoError}
        </p>
      ) : null}

      {project.githubRepository ? (
        <>
          <div className="project-github-list-toggle">
            <SegmentedPillToggle
              value={listTab}
              options={GITHUB_LIST_TAB_OPTIONS}
              onChange={(value) => {
                onGithubListTabChange?.(value);
              }}
              ariaLabel="Repository list"
            />
          </div>

          {branchesError ? (
            <p className="console-github-pane-error" role="alert">
              {apiErrorMessage(branchesError)}
            </p>
          ) : null}

          {listTab === "commits" ? (
            <>
              {commitsError ? (
                <p className="console-github-pane-error" role="alert">
                  {commitsError}
                </p>
              ) : null}

              {commitsLoading && commits.length === 0 ? (
                <p className="console-github-pane-status">Loading commits…</p>
              ) : null}

              {!commitsLoading &&
              !commitsError &&
              commits.length === 0 &&
              selectedBranch ? (
                <p className="console-github-pane-status">
                  No commits on this branch.
                </p>
              ) : null}

              {commits.length > 0 ? (
                <ul
                  ref={githubListRef}
                  className="console-github-commit-list"
                  {...githubListContainerProps}
                >
                  {commits.map((commit) => (
                    <li key={commit.sha} {...keyboardNavItemProps(commit.sha)}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={[
                          "console-github-commit",
                          keyboardNavListItemClass(
                            githubHighlightedId === commit.sha,
                          ),
                          selectedCommitSha === commit.sha
                            ? "is-selected"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          if (!project.githubRepository) return;
                          onSelectCommit?.(commit, project.githubRepository);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          if (!project.githubRepository) return;
                          onSelectCommit?.(commit, project.githubRepository);
                        }}
                      >
                        <div className="console-github-commit-body">
                          <div className="console-github-commit-message">
                            {commitSubject(commit.message)}
                          </div>
                          <div className="console-github-commit-meta">
                            {[
                              commit.shortSha,
                              commit.authorLogin || commit.authorName,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <div className="console-github-commit-trailing">
                          <span
                            className="console-github-commit-icon"
                            aria-hidden="true"
                          >
                            <GithubCommitIcon size={14} />
                          </span>
                          <span className="console-github-commit-age">
                            {formatRelativeAge(commit.authoredAt) || "—"}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {commitsHasMore && selectedBranch ? (
                <div className="console-github-pane-more">
                  <button
                    type="button"
                    className="console-btn"
                    disabled={commitsLoadingMore}
                    onClick={() => {
                      void loadCommitsPage(
                        selectedBranch,
                        commitsPage + 1,
                        true,
                      );
                    }}
                  >
                    {commitsLoadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {pullsError ? (
                <p className="console-github-pane-error" role="alert">
                  {pullsError}
                </p>
              ) : null}

              {pullsLoading && pullRequests.length === 0 ? (
                <p className="console-github-pane-status">
                  Loading pull requests…
                </p>
              ) : null}

              {!pullsLoading &&
              !pullsError &&
              pullRequests.length === 0 ? (
                <p className="console-github-pane-status">
                  No pull requests.
                </p>
              ) : null}

              {pullRequests.length > 0 ? (
                <ul
                  ref={githubListRef}
                  className="console-github-commit-list"
                  {...githubListContainerProps}
                >
                  {pullRequests.map((pull) => (
                    <li
                      key={pull.number}
                      {...keyboardNavItemProps(String(pull.number))}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className={[
                          "console-github-commit",
                          "console-github-pull",
                          keyboardNavListItemClass(
                            githubHighlightedId === String(pull.number),
                          ),
                          `is-${pull.state}`,
                          pull.draft ? "is-draft" : null,
                          selectedPullNumber === pull.number
                            ? "is-selected"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          if (!project.githubRepository) return;
                          onSelectPullRequest?.(
                            pull,
                            project.githubRepository,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          if (!project.githubRepository) return;
                          onSelectPullRequest?.(
                            pull,
                            project.githubRepository,
                          );
                        }}
                      >
                        <div className="console-github-commit-body">
                          <div className="console-github-commit-message">
                            {pull.title}
                          </div>
                          <div className="console-github-commit-meta">
                            {[
                              `#${pull.number}`,
                              pullRequestStateLabel(pull.state, pull.draft),
                              pull.authorLogin,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <div className="console-github-commit-trailing">
                          <span
                            className="console-github-pull-icon"
                            aria-hidden="true"
                          >
                            <GithubPullRequestIcon size={14} />
                          </span>
                          <span className="console-github-commit-age">
                            {formatRelativeAge(pull.updatedAt) || "—"}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {pullsHasMore ? (
                <div className="console-github-pane-more">
                  <button
                    type="button"
                    className="console-btn"
                    disabled={pullsLoadingMore}
                    onClick={() => {
                      void loadPullsPage(pullsPage + 1, true);
                    }}
                  >
                    {pullsLoadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

export function ProjectOverviewPane({
  project,
  projects,
  onProjectUpdated,
  githubListTab = "commits",
  onGithubListTabChange,
  selectedCommitSha,
  onSelectCommit,
  selectedPullNumber,
  onSelectPullRequest,
  tasksPanelCollapsed = false,
  onToggleTasksPanel,
  showHeader = true,
}: {
  project: ApiProject;
  projects: ApiProject[];
  onProjectUpdated: (project: ApiProject) => void;
  githubListTab?: GithubListTab;
  onGithubListTabChange?: (tab: GithubListTab) => void;
  selectedCommitSha?: string | null;
  onSelectCommit?: (commit: GithubCommit, repository: string) => void;
  selectedPullNumber?: number | null;
  onSelectPullRequest?: (
    pullRequest: GithubPullRequest,
    repository: string,
  ) => void;
  tasksPanelCollapsed?: boolean;
  onToggleTasksPanel?: () => void;
  /** When false, host chrome owns the pane header (stable breadcrumb). */
  showHeader?: boolean;
}) {
  const tasksPanelToggle =
    showHeader !== false && onToggleTasksPanel != null ? (
      <button
        type="button"
        className="console-icon-btn"
        onClick={onToggleTasksPanel}
        title={
          tasksPanelCollapsed
            ? "Show tasks panel"
            : "Hide tasks panel — expand overview"
        }
        aria-label={
          tasksPanelCollapsed
            ? "Show tasks panel"
            : "Hide tasks panel and expand overview"
        }
        aria-pressed={tasksPanelCollapsed}
      >
        <ProjectsSidePanelIcon collapsed={tasksPanelCollapsed} />
      </button>
    ) : null;
  const { client } = useConsoleApi();

  const loadTasks = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      const query = new URLSearchParams({ projectId: project.id });
      const result = await api.requestJson<{ tasks: ApiTask[] }>(
        `/api/v1/tasks?${query.toString()}`,
        { signal },
      );
      return result.tasks;
    },
    [project.id],
  );

  const loadOrganizations = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      const result = await api.requestJson<{
        organizations: ApiOrganization[];
      }>("/api/v1/organizations", { signal });
      return result.organizations;
    },
    [],
  );

  const { data: tasks, loading: tasksLoading } = useApiResource(loadTasks, [
    project.id,
  ]);
  const { data: organizations } = useApiResource(loadOrganizations, []);

  const taskProgress = useMemo(() => {
    const rows = tasks ?? [];
    return {
      total: rows.length,
      completed: rows.filter((task) => task.status === "completed").length,
    };
  }, [tasks]);

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        (organizations ?? []).map((org) => ({
          id: org.id,
          name: org.name,
        })),
        { includeNone: false },
      ),
    [organizations],
  );

  const patchProject = useCallback(
    async (patch: Record<string, unknown>) => {
      const updated = await client.requestJson<ApiProject>(
        `/api/v1/projects/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      onProjectUpdated(updated);
      return updated;
    },
    [client, onProjectUpdated, project.id],
  );

  const detailProject = useMemo(
    () => mapProjectForDetail(project, taskProgress),
    [project, taskProgress],
  );

  const saveName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false as const, error: "Project name is required." };
      }
      try {
        await patchProject({ name: trimmed });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: apiErrorMessage(error),
        };
      }
    },
    [patchProject],
  );

  if (tasksLoading && !tasks) {
    return (
      <>
        {showHeader ? (
          <div className="console-pane-header">
            <div className="console-pane-header-title console-project-pane-title">
              <span
                className="project-panel-overview-skeleton__header-icon detail-skeleton-block"
                aria-hidden="true"
              />
              <span
                className="project-panel-overview-skeleton__header-title detail-skeleton-block"
                aria-hidden="true"
              />
            </div>
            {tasksPanelToggle ? (
              <div className="console-pane-header-actions">{tasksPanelToggle}</div>
            ) : null}
          </div>
        ) : null}
        <div className="console-pane-body">
          <div className="console-project-overview console-content-swap">
            <ProjectPanelOverviewSkeleton />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {showHeader ? (
        <div className="console-pane-header">
          <div className="console-pane-header-title console-project-pane-title">
            <ProjectOverviewIcon
              icon={project.icon}
              name={project.name}
              size={14}
              variant="bare"
              onIconChange={(icon) => {
                void patchProject({ icon });
              }}
            />
            <OverviewNameEditor
              value={project.name}
              entityLabel="Project"
              resetKey={project.id}
              titleClassName="console-project-pane-name"
              onSave={saveName}
            />
          </div>
          {tasksPanelToggle ? (
            <div className="console-pane-header-actions">{tasksPanelToggle}</div>
          ) : null}
        </div>
      ) : null}
      <div className="console-pane-body">
        <div
          key={project.id}
          className="console-project-overview console-content-swap"
        >
          <ProjectPanelDetailView
            project={detailProject}
            section="overview"
            showHeader={false}
            organizationOptions={organizationOptions}
            propertiesExtra={
              <ProjectWorkingDirectoryField
                project={project}
                onProjectUpdated={onProjectUpdated}
              />
            }
            repositoriesSection={
              project.type === "codebase" ? (
                <ProjectCommitHistory
                  project={project}
                  onProjectUpdated={onProjectUpdated}
                  githubListTab={githubListTab}
                  onGithubListTabChange={onGithubListTabChange}
                  selectedCommitSha={selectedCommitSha}
                  onSelectCommit={onSelectCommit}
                  selectedPullNumber={selectedPullNumber}
                  onSelectPullRequest={onSelectPullRequest}
                />
              ) : null
            }
            onSaveName={saveName}
            onSaveKey={async (key) => {
              const trimmed = key.trim();
              if (!trimmed) {
                return { ok: false as const, error: "Project key is required." };
              }
              const conflict = projects.some(
                (entry) =>
                  entry.id !== project.id &&
                  entry.key.toLowerCase() === trimmed.toLowerCase(),
              );
              if (conflict) {
                return {
                  ok: false as const,
                  error: "Project key already exists.",
                };
              }
              try {
                const updated = await patchProject({ key: trimmed });
                return { ok: true as const, key: updated.key };
              } catch (error) {
                return {
                  ok: false as const,
                  error: apiErrorMessage(error),
                };
              }
            }}
        onSaveSummary={(summary) => {
          void patchProject({ summary: summary.trim() ? summary.trim() : null }).catch(
            () => undefined,
          );
        }}
        onSaveDescription={(description) => {
          void patchProject({
            description: description.trim() ? description.trim() : null,
          }).catch(() => undefined);
        }}
        onIconChange={(icon) => {
          void patchProject({ icon }).catch(() => undefined);
        }}
        onStatusChange={(status: ProjectStatus) => {
          void patchProject({ status }).catch(() => undefined);
        }}
        onPriorityChange={(priority) => {
          void patchProject({ priority }).catch(() => undefined);
        }}
        onTypeChange={(type) => {
          void patchProject({ type }).catch(() => undefined);
        }}
        onAreaChange={(area: ProjectArea | null) => {
          void patchProject({ area }).catch(() => undefined);
        }}
        onOrganizationChange={(organizationId) => {
          void patchProject({ organizationId }).catch(() => undefined);
        }}
        onStartDateChange={(startDate) => {
          void patchProject({
            startDate: startDate ? startDate.toISOString() : null,
          }).catch(() => undefined);
        }}
        onDueDateChange={(dueDate) => {
          void patchProject({
            dueDate: dueDate ? dueDate.toISOString() : null,
          }).catch(() => undefined);
        }}
          />
        </div>
      </div>
    </>
  );
}
