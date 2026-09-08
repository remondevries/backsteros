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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LIST_KEYBOARD_NAV_ZONE_CONTENT } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import type { ProjectArea } from "../../projects/project-areas.js";
import type { ProjectStatus } from "../../projects/project-status.js";
import { buildOrganizationDropdownOptions } from "../dropdowns/dropdown-options.js";
import { ComposeFolderIcon } from "../compose/compose-folder-icon.js";
import { DocumentIcon } from "../documents/document-icon.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { ProjectOverviewIcon } from "../projects/project-overview-icon.js";
import { ProjectPanelDetailView } from "../projects/project-panel-detail-view.js";
import type { ProjectDetailNestedArea } from "../projects/project-detail-view.js";
import { ProjectPanelOverviewSkeleton } from "../skeletons/project-panel-overview-skeleton.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TasksNavIcon } from "../shell/sidebar-nav-icons.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseGithubListTab } from "./codebase-github-list-tab.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import { GithubCommitIcon } from "./github-commit-icon.js";
import {
  clearCachedGithubProjectData,
  clearCachedRepositories,
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
} from "./github-project-cache.js";
import { GithubPullRequestIcon } from "./github-pull-request-icon.js";
import { normalizeWorkingDirectory } from "./normalize-working-directory.js";
import type { ProjectFsClient } from "./project-fs-types.js";
import { ProjectWorkingDirectoryTree } from "./project-working-directory-tree.js";
import { ProjectsSidePanelIcon } from "./projects-side-panel-icon.js";
import type { SelectProjectFileHandler } from "./select-project-file.js";
import { TerminalDirectoryGate } from "./terminal-directory-gate.js";
import { useRequestResource } from "./use-request-resource.js";

const NONE_REPO_VALUE = "__none__";

const CODEBASE_LIST_TAB_OPTIONS = [
  { value: "tasks" as const, label: "Tasks" },
  { value: "files" as const, label: "Files" },
  { value: "docs" as const, label: "Docs" },
  { value: "commits" as const, label: "Commits" },
  { value: "pulls" as const, label: "PRs" },
];

const GITHUB_LIST_TAB_ICONS: Record<
  Exclude<CodebaseGithubListTab, "tasks" | "files" | "docs">,
  string
> = {
  commits: "git-commit",
  pulls: "git-pull-request",
};

function ProjectListTabIcon({ tab }: { tab: CodebaseGithubListTab }) {
  if (tab === "tasks") {
    return <TasksNavIcon className="project-github-list-toggle__tasks-icon" />;
  }
  if (tab === "files") {
    // Same folder mark as compose / documents on web + desktop.
    return <ComposeFolderIcon className="project-github-list-toggle__folder-icon" />;
  }
  if (tab === "docs") {
    return <DocumentIcon size={14} className="project-github-list-toggle__folder-icon" />;
  }
  return <ProjectOcticon icon={GITHUB_LIST_TAB_ICONS[tab]} size={14} />;
}

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
    areaId: project.areaId,
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

function withPickedWorkingDirectory(
  project: ApiProject,
  directory: string,
): ApiProject {
  return {
    ...project,
    localWorkingDirectory: directory,
    updatedAt: new Date().toISOString(),
  };
}

function ProjectWorkingDirectoryField({
  project,
  onProjectUpdated,
  requestJson,
  fs,
}: {
  project: ApiProject;
  onProjectUpdated: (project: ApiProject) => void;
  requestJson: CodebaseRequestJson;
  fs: ProjectFsClient;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const directory = normalizeWorkingDirectory(project.localWorkingDirectory);

  const hasDirectory = Boolean(directory);
  const label = hasDirectory
    ? workingDirectoryLabel(directory!)
    : "Set folder…";

  return (
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
        error ??
        directory ??
        "Choose working directory (required before starting an agent)"
      }
      aria-label={
        error
          ? error
          : hasDirectory
            ? `Working directory: ${directory}`
            : "Choose working directory (required before starting an agent)"
      }
      aria-invalid={error ? true : undefined}
      disabled={saving}
      onClick={() => {
        void (async () => {
          setSaving(true);
          setError(null);
          const previous = project;
          try {
            const next = await fs.pickDirectory(directory ?? undefined);
            if (!next) return;
            // Apply the picked path immediately — leader-first PATCH can return
            // a stale row before local replication catches up, which left the
            // chip stuck on the previous value (or empty).
            onProjectUpdated(withPickedWorkingDirectory(project, next));
            const updated = await requestJson<ApiProject>(
              `/api/v1/projects/${encodeURIComponent(project.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ localWorkingDirectory: next }),
              },
            );
            onProjectUpdated(withPickedWorkingDirectory(updated, next));
          } catch (err) {
            onProjectUpdated(previous);
            setError(
              apiErrorMessage(err) || "Could not save working directory.",
            );
          } finally {
            setSaving(false);
          }
        })();
      }}
    >
      <span className="property-dropdown-trigger__icon" aria-hidden="true">
        <ComposeFolderIcon className="" />
      </span>
      <span className="property-dropdown-trigger__label">{label}</span>
    </button>
  );
}

function ProjectCommitHistory({
  project,
  onProjectUpdated,
  requestJson,
  fs,
  githubListTab,
  onGithubListTabChange,
  selectedCommitSha,
  onSelectCommit,
  selectedPullNumber,
  onSelectPullRequest,
  selectedFilePath,
  onSelectFile,
  onFileEntryDeleted,
  fileTreeRefreshToken = 0,
  githubRefreshToken = 0,
  docsListPanel = null,
  minimized = false,
  showTabs = true,
  githubDetailEngaged = false,
}: {
  project: ApiProject;
  onProjectUpdated: (project: ApiProject) => void;
  requestJson: CodebaseRequestJson;
  fs: ProjectFsClient;
  githubListTab: CodebaseGithubListTab;
  onGithubListTabChange?: (tab: CodebaseGithubListTab) => void;
  selectedCommitSha?: string | null;
  onSelectCommit?: (
    commit: GithubCommit,
    repository: string,
    options?: { engageHotkeys?: boolean },
  ) => void;
  selectedPullNumber?: number | null;
  onSelectPullRequest?: (
    pullRequest: GithubPullRequest,
    repository: string,
    options?: { engageHotkeys?: boolean },
  ) => void;
  selectedFilePath?: string | null;
  onSelectFile?: SelectProjectFileHandler;
  onFileEntryDeleted?: (path: string) => void;
  fileTreeRefreshToken?: number;
  /** Bumped after Settings GitHub token connect so fetches retry. */
  githubRefreshToken?: number;
  /** Project documents tree for the Docs tab (same slot as Files). */
  docsListPanel?: ReactNode;
  /** Narrow ⇧[ rail: icon stack / compact rows. */
  minimized?: boolean;
  /** When false, host renders the Files/Docs/Commits/PRs toggle. */
  showTabs?: boolean;
  /** True while commit/PR detail owns keyboard (Enter/Space/Tab) — hide list orange ring. */
  githubDetailEngaged?: boolean;
}) {
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
  const [errorRefreshToken, setErrorRefreshToken] = useState(0);
  const refreshToken = githubRefreshToken + errorRefreshToken;

  const loadRepositories = useCallback(
    async (api: CodebaseRequestJson, signal: AbortSignal) => {
      if (refreshToken === 0) {
        const cached = getCachedRepositories();
        if (cached) return cached;
      }
      const result = await api<{
        repositories: GithubRepository[];
      }>("/api/v1/github/repositories", { signal });
      setCachedRepositories(result.repositories);
      return result.repositories;
    },
    [refreshToken],
  );

  const {
    data: repositories,
    error: repositoriesError,
    loading: repositoriesLoading,
  } = useRequestResource(requestJson, loadRepositories, [
    project.id,
    refreshToken,
  ]);

  useEffect(() => {
    if (refreshToken === 0) return;
    clearCachedRepositories();
    clearCachedGithubProjectData(project.id);
    loadedCommitsKeyRef.current = null;
    loadedPullsKeyRef.current = null;
    setCommitsError(null);
    setPullsError(null);
    setRepoError(null);
  }, [refreshToken, project.id]);

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
        const updated = await requestJson<ApiProject>(
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
    [requestJson, onProjectUpdated, project.id],
  );

  const loadBranches = useCallback(
    async (api: CodebaseRequestJson, signal: AbortSignal) => {
      if (!project.githubRepository) {
        return {
          repository: null as string | null,
          defaultBranch: null as string | null,
          branches: [] as GithubBranch[],
        } satisfies GithubBranchesPayload;
      }
      if (refreshToken === 0) {
        const cached = getCachedBranches(project.id, project.githubRepository);
        if (cached) return cached;
      }
      const payload = await api<GithubBranchesPayload>(
        `/api/v1/projects/${encodeURIComponent(project.id)}/github/branches`,
        { signal },
      );
      setCachedBranches(project.id, project.githubRepository, payload);
      return payload;
    },
    [refreshToken, project.githubRepository, project.id],
  );

  const {
    data: branchPayload,
    error: branchesError,
    loading: branchesLoading,
  } = useRequestResource(requestJson, loadBranches, [
    project.id,
    project.githubRepository ?? "",
    refreshToken,
  ]);

  // If lists failed before OAuth finished, retry when the window is focused again.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === "hidden") return;
      if (!repositoriesError && !branchesError && !commitsError && !pullsError) {
        return;
      }
      setErrorRefreshToken((token) => token + 1);
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [branchesError, commitsError, pullsError, repositoriesError]);

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
        const result = await requestJson<{
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
    [requestJson, project.githubRepository, project.id],
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
        const result = await requestJson<{
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
    [requestJson, project.githubRepository, project.id],
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
    refreshToken,
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
    refreshToken,
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
  const githubItemIds = useMemo(() => {
    if (listTab === "commits") {
      return commits.map((commit) => commit.sha);
    }
    if (listTab === "pulls") {
      return pullRequests.map((pull) => String(pull.number));
    }
    return [];
  }, [commits, listTab, pullRequests]);
  const githubSelectedId =
    listTab === "commits"
      ? (selectedCommitSha ?? null)
      : listTab === "pulls" && selectedPullNumber != null
        ? String(selectedPullNumber)
        : null;
  const navigateGithubItem = useCallback(
    (itemId: string) => {
      if (!project.githubRepository) return;
      if (listTab === "commits") {
        const commit = commits.find((entry) => entry.sha === itemId);
        if (commit) {
          onSelectCommit?.(commit, project.githubRepository, {
            engageHotkeys: true,
          });
        }
        return;
      }
      const pull = pullRequests.find(
        (entry) => String(entry.number) === itemId,
      );
      if (pull) {
        onSelectPullRequest?.(pull, project.githubRepository, {
          engageHotkeys: true,
        });
      }
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
  const { activeZone, setActiveZone, clearHighlights } =
    useListKeyboardNavigationZone();
  // Register whenever commits/PRs are visible — do not require content zone
  // first (that chicken-and-egg left j/k on the projects rail after 2 / 3).
  // Registration alone does not steal focus; 1 / 2 / 3 (or the effect below)
  // activate the content zone.
  // While a commit/PR detail is engaged, drop list j/k + orange ring so focus
  // reads as inside the detail (Escape / Tab restores the list).
  const githubKeyboardEnabled =
    Boolean(project.githubRepository) &&
    (listTab === "commits" || listTab === "pulls") &&
    githubItemIds.length > 0 &&
    !githubDetailEngaged;
  const { highlightedId: githubHighlightedId } = useListKeyboardNavigation({
    containerRef: githubListRef,
    itemIds: githubItemIds,
    selectedId: githubSelectedId,
    onNavigate: navigateGithubItem,
    zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
    enabled: githubKeyboardEnabled,
  });

  // Enter/Space / Tab into commit or PR detail — clear list highlight/focus.
  useEffect(() => {
    if (!githubDetailEngaged) return;
    if (listTab !== "pulls" && listTab !== "commits") return;
    clearHighlights();
    const root = githubListRef.current;
    const active = document.activeElement;
    if (active instanceof HTMLElement && root?.contains(active)) {
      active.blur();
    }
  }, [clearHighlights, githubDetailEngaged, listTab]);
  const previousGithubListTabRef = useRef(listTab);
  const previousProjectIdRef = useRef(project.id);
  /** Auto-open first row only when entering Commits/PRs — not after Escape clears. */
  const autoSelectOnTabRef = useRef<"commits" | "pulls" | null>(
    listTab === "commits" || listTab === "pulls" ? listTab : null,
  );
  useEffect(() => {
    const tabChanged = previousGithubListTabRef.current !== listTab;
    const projectChanged = previousProjectIdRef.current !== project.id;
    previousGithubListTabRef.current = listTab;
    previousProjectIdRef.current = project.id;

    if (tabChanged) {
      autoSelectOnTabRef.current =
        listTab === "commits" || listTab === "pulls" ? listTab : null;
    }

    if (listTab === "files" || listTab === "docs") {
      // Pill / 2–3 / project switch — j/k on the files or docs tree.
      if (tabChanged || projectChanged) {
        setActiveZone("content", { activate: true });
      }
      return;
    }

    if (listTab === "tasks" || githubItemIds.length === 0) return;

    // 4 / 5 or commits/PRs pill — activate once the list has rows.
    if (tabChanged || projectChanged) {
      setActiveZone("content", { activate: true });
      return;
    }

    // After a tab switch, list unregister can briefly leave the projects rail
    // active; pull j/k back to content when items are ready. Do not steal from
    // main (task list) after Enter on a project.
    if (activeZone === "sidepanel") {
      setActiveZone("content", { activate: true });
    }
  }, [activeZone, githubItemIds.length, listTab, project.id, setActiveZone]);

  useEffect(() => {
    if (autoSelectOnTabRef.current !== "commits") return;
    if (listTab !== "commits") return;
    if (!project.githubRepository || commits.length === 0) return;
    if (selectedCommitSha) {
      autoSelectOnTabRef.current = null;
      // Selection change clears list highlight — re-activate content for j/k
      // on the open commit (not the first row).
      const sha = selectedCommitSha;
      requestAnimationFrame(() => {
        setActiveZone("content", {
          activate: true,
          highlightItemId: sha,
        });
      });
      return;
    }
    const first = commits[0];
    if (!first) return;
    // Keep pending until selection sticks (URL sync used to wipe it once).
    onSelectCommit?.(first, project.githubRepository);
  }, [
    commits,
    listTab,
    onSelectCommit,
    project.githubRepository,
    selectedCommitSha,
    setActiveZone,
  ]);

  useEffect(() => {
    if (autoSelectOnTabRef.current !== "pulls") return;
    if (listTab !== "pulls") return;
    if (!project.githubRepository || pullRequests.length === 0) return;
    if (selectedPullNumber != null) {
      autoSelectOnTabRef.current = null;
      const pullId = String(selectedPullNumber);
      requestAnimationFrame(() => {
        setActiveZone("content", {
          activate: true,
          highlightItemId: pullId,
        });
      });
      return;
    }
    const first = pullRequests[0];
    if (!first) return;
    onSelectPullRequest?.(first, project.githubRepository, {
      engageHotkeys: false,
    });
  }, [
    listTab,
    onSelectPullRequest,
    project.githubRepository,
    pullRequests,
    selectedPullNumber,
    setActiveZone,
  ]);

  // Escape / explicit clear while staying on the tab — do not auto-reopen.
  const previousSelectedCommitShaRef = useRef(selectedCommitSha);
  const previousSelectedPullNumberRef = useRef(selectedPullNumber);
  useEffect(() => {
    if (
      listTab === "commits" &&
      previousSelectedCommitShaRef.current &&
      !selectedCommitSha
    ) {
      autoSelectOnTabRef.current = null;
    }
    if (
      listTab === "pulls" &&
      previousSelectedPullNumberRef.current != null &&
      selectedPullNumber == null
    ) {
      autoSelectOnTabRef.current = null;
    }
    previousSelectedCommitShaRef.current = selectedCommitSha;
    previousSelectedPullNumberRef.current = selectedPullNumber;
  }, [listTab, selectedCommitSha, selectedPullNumber]);

  return (
    <div
      className={
        showTabs || minimized
          ? `project-panel-repositories${minimized ? " is-minimized" : ""}`
          : "project-panel-list-body"
      }
    >
      {!minimized && listTab !== "docs" && listTab !== "files" ? (
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
      ) : null}
      {!minimized &&
      listTab !== "docs" &&
      listTab !== "files" &&
      repositoriesError ? (
        <p className="console-github-pane-error" role="alert">
          {apiErrorMessage(repositoriesError)}
        </p>
      ) : null}
      {!minimized && listTab !== "docs" && listTab !== "files" && repoError ? (
        <p className="console-github-pane-error" role="alert">
          {repoError}
        </p>
      ) : null}

      {showTabs && minimized ? (
        <div
          className="project-github-list-toggle project-github-list-toggle--vertical"
          role="tablist"
          aria-label="Project lists"
        >
          {CODEBASE_LIST_TAB_OPTIONS.map((option) => {
            const active = listTab === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                className={`project-github-list-toggle__btn${
                  active ? " is-active" : ""
                }`}
                title={option.label}
                onClick={() => {
                  onGithubListTabChange?.(option.value);
                }}
              >
                <span className="project-github-list-toggle__icon" aria-hidden="true">
                  <ProjectListTabIcon tab={option.value} />
                </span>
                <span className="project-github-list-toggle__label">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {showTabs && !minimized ? (
        <div className="project-github-list-toggle">
          <SegmentedPillToggle
            value={listTab}
            options={CODEBASE_LIST_TAB_OPTIONS}
            onChange={(value) => {
              onGithubListTabChange?.(value);
            }}
            ariaLabel="Project lists"
          />
        </div>
      ) : null}

      {listTab === "files" && !minimized ? (
        <div className="console-fs-tree-pane">
          {normalizeWorkingDirectory(project.localWorkingDirectory) ? (
            <ProjectWorkingDirectoryTree
              workingDirectory={normalizeWorkingDirectory(
                project.localWorkingDirectory,
              )}
              fs={fs}
              selectedPath={selectedFilePath}
              onSelectFile={onSelectFile}
              onEntryDeleted={onFileEntryDeleted}
              refreshToken={fileTreeRefreshToken}
            />
          ) : (
            <TerminalDirectoryGate
              compact
              showHeader={false}
              fs={fs}
              message="Files are unavailable until a working directory is defined for this project."
              onSelectDirectory={async (directory) => {
                onProjectUpdated(
                  withPickedWorkingDirectory(project, directory),
                );
                try {
                  const updated = await requestJson<ApiProject>(
                    `/api/v1/projects/${encodeURIComponent(project.id)}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        localWorkingDirectory: directory,
                      }),
                    },
                  );
                  onProjectUpdated(
                    withPickedWorkingDirectory(updated, directory),
                  );
                } catch (err) {
                  onProjectUpdated(project);
                  throw err;
                }
              }}
            />
          )}
        </div>
      ) : null}

      {listTab === "docs" && !minimized ? (
        <div className="console-fs-tree-pane console-fs-tree-pane--docs">
          {docsListPanel ?? (
            <p className="console-github-pane-status">No documents yet.</p>
          )}
        </div>
      ) : null}

      {!project.githubRepository &&
      (listTab === "commits" || listTab === "pulls") &&
      !minimized ? (
        <p className="console-github-pane-status">
          Link a GitHub repository to browse commits and pull requests.
        </p>
      ) : null}

      {project.githubRepository &&
      (listTab === "commits" || listTab === "pulls") ? (
        <>
          {!minimized && branchesError ? (
            <p className="console-github-pane-error" role="alert">
              {apiErrorMessage(branchesError)}
            </p>
          ) : null}

          {listTab === "commits" ? (
            <>
              {!minimized && commitsError ? (
                <p className="console-github-pane-error" role="alert">
                  {commitsError}
                </p>
              ) : null}

              {!minimized && commitsLoading && commits.length === 0 ? (
                <p className="console-github-pane-status">Loading commits…</p>
              ) : null}

              {!minimized &&
              !commitsLoading &&
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
                    <li key={commit.sha}>
                      <div
                        role="button"
                        tabIndex={0}
                        {...keyboardNavItemProps(commit.sha)}
                        className={[
                          "console-github-commit",
                          keyboardNavListItemClass(
                            !githubDetailEngaged &&
                              githubHighlightedId === commit.sha,
                          ),
                          selectedCommitSha === commit.sha &&
                          !githubDetailEngaged
                            ? "is-selected"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-label={`${commitSubject(commit.message)} · ${
                          formatRelativeAge(commit.authoredAt) || "unknown age"
                        }`}
                        onClick={() => {
                          if (!project.githubRepository) return;
                          onSelectCommit?.(commit, project.githubRepository, {
                            engageHotkeys: true,
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          if (!project.githubRepository) return;
                          onSelectCommit?.(commit, project.githubRepository, {
                            engageHotkeys: true,
                          });
                        }}
                      >
                        {!minimized ? (
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
                        ) : null}
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
                  {!minimized && commitsHasMore && selectedBranch ? (
                    <li className="console-github-pane-more">
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
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              {!minimized && pullsError ? (
                <p className="console-github-pane-error" role="alert">
                  {pullsError}
                </p>
              ) : null}

              {!minimized && pullsLoading && pullRequests.length === 0 ? (
                <p className="console-github-pane-status">
                  Loading pull requests…
                </p>
              ) : null}

              {!minimized &&
              !pullsLoading &&
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
                    <li key={pull.number}>
                      <div
                        role="button"
                        tabIndex={0}
                        {...keyboardNavItemProps(String(pull.number))}
                        className={[
                          "console-github-commit",
                          "console-github-pull",
                          keyboardNavListItemClass(
                            !githubDetailEngaged &&
                              githubHighlightedId === String(pull.number),
                          ),
                          `is-${pull.state}`,
                          pull.draft ? "is-draft" : null,
                          selectedPullNumber === pull.number &&
                          !githubDetailEngaged
                            ? "is-selected"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-label={`#${pull.number}: ${pull.title}`}
                        onClick={() => {
                          if (!project.githubRepository) return;
                          onSelectPullRequest?.(
                            pull,
                            project.githubRepository,
                            { engageHotkeys: true },
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
                            { engageHotkeys: true },
                          );
                        }}
                      >
                        {!minimized ? (
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
                        ) : null}
                        <div className="console-github-commit-trailing">
                          <span
                            className="console-github-pull-icon"
                            aria-hidden="true"
                          >
                            <GithubPullRequestIcon size={14} />
                          </span>
                          {minimized ? (
                            <span className="console-github-pull-number">
                              #{pull.number}
                            </span>
                          ) : (
                            <span className="console-github-commit-age">
                              {formatRelativeAge(pull.updatedAt) || "—"}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {!minimized && pullsHasMore ? (
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

export type CodebaseProjectOverviewPaneProps = {
  project: ApiProject;
  projects: ApiProject[];
  onProjectUpdated: (project: ApiProject) => void;
  requestJson: CodebaseRequestJson;
  fs: ProjectFsClient;
  githubListTab?: CodebaseGithubListTab;
  onGithubListTabChange?: (tab: CodebaseGithubListTab) => void;
  selectedCommitSha?: string | null;
  onSelectCommit?: (
    commit: GithubCommit,
    repository: string,
    options?: { engageHotkeys?: boolean },
  ) => void;
  selectedPullNumber?: number | null;
  onSelectPullRequest?: (
    pullRequest: GithubPullRequest,
    repository: string,
    options?: { engageHotkeys?: boolean },
  ) => void;
  selectedFilePath?: string | null;
  onSelectFile?: SelectProjectFileHandler;
  onFileEntryDeleted?: (path: string) => void;
  fileTreeRefreshToken?: number;
  /** Project documents tree for the Docs tab (same slot as Files). */
  docsListPanel?: ReactNode;
  tasksPanelCollapsed?: boolean;
  onToggleTasksPanel?: () => void;
  /** When false, host chrome owns the pane header (stable breadcrumb). */
  showHeader?: boolean;
  /** Narrow ⇧[ rail — Files/Docs/Commits/PRs compact presentation. */
  minimized?: boolean;
  /** True while commit/PR detail owns keyboard — suppress list orange highlight. */
  githubDetailEngaged?: boolean;
  /** Optional host-supplied organizations (skips fetch when provided). */
  organizations?: ApiOrganization[] | null;
  /** Nested custom areas for the Areas parent/sub-area dropdowns. */
  nestedAreas?: ProjectDetailNestedArea[];
  /**
   * Create an organization from a no-match search query and assign it.
   * When omitted, the pane POSTs `/api/v1/organizations` then patches the project.
   */
  onCreateOrganizationFromQuery?: (query: string) => void;
  /** Optional host-supplied project tasks for progress (skips fetch when provided). */
  tasks?: ApiTask[] | null;
  /** Optional progress override; when set with tasks omitted, skips task fetch. */
  taskProgress?: { total: number; completed: number } | null;
  /** Bumped after Settings GitHub token connect so fetches retry. */
  githubRefreshToken?: number;
};

export function CodebaseProjectOverviewPane({
  project,
  projects,
  onProjectUpdated,
  requestJson,
  fs,
  githubListTab = "tasks",
  onGithubListTabChange,
  selectedCommitSha,
  onSelectCommit,
  selectedPullNumber,
  onSelectPullRequest,
  selectedFilePath,
  onSelectFile,
  onFileEntryDeleted,
  fileTreeRefreshToken = 0,
  docsListPanel = null,
  tasksPanelCollapsed = false,
  onToggleTasksPanel,
  showHeader = true,
  minimized = false,
  githubDetailEngaged = false,
  organizations: organizationsProp = null,
  nestedAreas = [],
  onCreateOrganizationFromQuery: onCreateOrganizationFromQueryProp,
  tasks: tasksProp = null,
  taskProgress: taskProgressProp = null,
  githubRefreshToken = 0,
}: CodebaseProjectOverviewPaneProps) {
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

  const loadTasks = useCallback(
    async (api: CodebaseRequestJson, signal: AbortSignal) => {
      const query = new URLSearchParams({ projectId: project.id });
      const result = await api<{ tasks: ApiTask[] }>(
        `/api/v1/tasks?${query.toString()}`,
        { signal },
      );
      return result.tasks;
    },
    [project.id],
  );

  const loadOrganizations = useCallback(
    async (api: CodebaseRequestJson, signal: AbortSignal) => {
      const result = await api<{
        organizations: ApiOrganization[];
      }>("/api/v1/organizations", { signal });
      return result.organizations;
    },
    [],
  );

  const shouldFetchTasks =
    tasksProp == null && taskProgressProp == null;
  const shouldFetchOrganizations = organizationsProp == null;

  const skipTasksLoad = useCallback(
    async (_api: CodebaseRequestJson, _signal: AbortSignal): Promise<ApiTask[]> =>
      [],
    [],
  );
  const skipOrganizationsLoad = useCallback(
    async (
      _api: CodebaseRequestJson,
      _signal: AbortSignal,
    ): Promise<ApiOrganization[]> => [],
    [],
  );

  const { data: fetchedTasks, loading: tasksLoading } = useRequestResource(
    requestJson,
    shouldFetchTasks ? loadTasks : skipTasksLoad,
    shouldFetchTasks ? [project.id] : ["__skip_tasks__"],
  );
  const { data: fetchedOrganizations } = useRequestResource(
    requestJson,
    shouldFetchOrganizations ? loadOrganizations : skipOrganizationsLoad,
    shouldFetchOrganizations ? [] : ["__skip_orgs__"],
  );

  const tasks = shouldFetchTasks ? fetchedTasks : tasksProp;
  const organizations = shouldFetchOrganizations
    ? fetchedOrganizations
    : organizationsProp;

  const [createdOrganizations, setCreatedOrganizations] = useState<
    ApiOrganization[]
  >([]);

  useEffect(() => {
    setCreatedOrganizations([]);
  }, [project.id]);

  const taskProgress = useMemo(() => {
    if (taskProgressProp) return taskProgressProp;
    const rows = tasks ?? [];
    return {
      total: rows.length,
      completed: rows.filter((task) => task.status === "completed").length,
    };
  }, [taskProgressProp, tasks]);

  const organizationOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const org of organizations ?? []) {
      byId.set(org.id, { id: org.id, name: org.name });
    }
    for (const org of createdOrganizations) {
      byId.set(org.id, { id: org.id, name: org.name });
    }
    return buildOrganizationDropdownOptions([...byId.values()], {
      includeNone: false,
    });
  }, [createdOrganizations, organizations]);

  const patchProject = useCallback(
    async (patch: Record<string, unknown>) => {
      const updated = await requestJson<ApiProject>(
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
    [requestJson, onProjectUpdated, project.id],
  );

  const createOrganizationFromQuery = useCallback(
    (query: string) => {
      if (onCreateOrganizationFromQueryProp) {
        onCreateOrganizationFromQueryProp(query);
        return;
      }
      const name = query.trim();
      if (!name) return;
      void (async () => {
        try {
          const organization = await requestJson<ApiOrganization>(
            "/api/v1/organizations",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, sortOrder: -Date.now() }),
            },
          );
          setCreatedOrganizations((rows) =>
            rows.some((entry) => entry.id === organization.id)
              ? rows
              : [...rows, organization],
          );
          await patchProject({ organizationId: organization.id });
        } catch {
          // Keep the dropdown usable; host toasts are optional.
        }
      })();
    },
    [onCreateOrganizationFromQueryProp, patchProject, requestJson],
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

  if (minimized) {
    return (
      <div className="console-pane-body">
        <div
          className={`project-panel-repositories is-minimized`}
        >
          <div
            className="project-github-list-toggle project-github-list-toggle--vertical"
            role="tablist"
            aria-label="Project lists"
          >
            {CODEBASE_LIST_TAB_OPTIONS.map((option) => {
              const active = githubListTab === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`project-github-list-toggle__btn${
                    active ? " is-active" : ""
                  }`}
                  title={option.label}
                  onClick={() => {
                    onGithubListTabChange?.(option.value);
                  }}
                >
                  <span
                    className="project-github-list-toggle__icon"
                    aria-hidden="true"
                  >
                    <ProjectListTabIcon tab={option.value} />
                  </span>
                  <span className="project-github-list-toggle__label">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
          {githubListTab !== "tasks" &&
          githubListTab !== "files" &&
          githubListTab !== "docs" ? (
            <ProjectCommitHistory
              project={project}
              onProjectUpdated={onProjectUpdated}
              requestJson={requestJson}
              fs={fs}
              githubListTab={githubListTab}
              onGithubListTabChange={onGithubListTabChange}
              selectedCommitSha={selectedCommitSha}
              onSelectCommit={onSelectCommit}
              selectedPullNumber={selectedPullNumber}
              onSelectPullRequest={onSelectPullRequest}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
              onFileEntryDeleted={onFileEntryDeleted}
              fileTreeRefreshToken={fileTreeRefreshToken}
              docsListPanel={docsListPanel}
              githubRefreshToken={githubRefreshToken}
              minimized
              showTabs={false}
              githubDetailEngaged={githubDetailEngaged}
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (shouldFetchTasks && tasksLoading && !tasks) {
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
          <div className="project-panel-repositories">
            <div className="project-github-list-toggle">
              <SegmentedPillToggle
                value={githubListTab}
                options={CODEBASE_LIST_TAB_OPTIONS}
                onChange={(value) => {
                  onGithubListTabChange?.(value);
                }}
                ariaLabel="Project lists"
              />
            </div>
            {githubListTab === "tasks" ? (
              <ProjectPanelDetailView
                project={detailProject}
                section="overview"
                showHeader={false}
                nestedAreas={nestedAreas}
                organizationOptions={organizationOptions}
                propertiesExtra={
                  <ProjectWorkingDirectoryField
                    project={project}
                    onProjectUpdated={onProjectUpdated}
                    requestJson={requestJson}
                    fs={fs}
                  />
                }
                onSaveName={saveName}
                onSaveKey={async (key) => {
                  const trimmed = key.trim();
                  if (!trimmed) {
                    return {
                      ok: false as const,
                      error: "Project key is required.",
                    };
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
                  void patchProject({
                    summary: summary.trim() ? summary.trim() : null,
                  }).catch(() => undefined);
                }}
                onSaveDescription={(description) => {
                  void patchProject({
                    description: description.trim()
                      ? description.trim()
                      : null,
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
                  void patchProject({ area, areaId: null }).catch(
                    () => undefined,
                  );
                }}
                onAreaIdChange={(areaId) => {
                  void patchProject({ areaId }).catch(() => undefined);
                }}
                onOrganizationChange={(organizationId) => {
                  void patchProject({ organizationId }).catch(() => undefined);
                }}
                onCreateOrganizationFromQuery={createOrganizationFromQuery}
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
            ) : (
              <ProjectCommitHistory
                project={project}
                onProjectUpdated={onProjectUpdated}
                requestJson={requestJson}
                fs={fs}
                githubListTab={githubListTab}
                onGithubListTabChange={onGithubListTabChange}
                selectedCommitSha={selectedCommitSha}
                onSelectCommit={onSelectCommit}
                selectedPullNumber={selectedPullNumber}
                onSelectPullRequest={onSelectPullRequest}
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
                onFileEntryDeleted={onFileEntryDeleted}
                fileTreeRefreshToken={fileTreeRefreshToken}
                docsListPanel={docsListPanel}
                githubRefreshToken={githubRefreshToken}
                showTabs={false}
                githubDetailEngaged={githubDetailEngaged}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
