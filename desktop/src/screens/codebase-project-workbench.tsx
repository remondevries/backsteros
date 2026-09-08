import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  GithubCommit,
  GithubPullRequest,
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  CodebaseProjectOverviewPane,
  CommitDetailPane,
  FileDetailPane,
  PullRequestDetailPane,
  getCodebaseWorkbenchHref,
  normalizeWorkingDirectory,
  parseCodebaseWorkbenchPath,
  isCodebaseDetailEditorFocused,
  isBlockingModalOpen,
  requestCodebaseDetailEnterFocus,
  requestCodebaseDetailLeaveFocus,
  shouldHandleGlobalShortcut,
  useListKeyboardNavigationZone,
  type CodebaseGithubListTab,
  type ProjectDetailNestedArea,
  type ProjectFsClient,
  type ProjectRouteScope,
  type SelectProjectFileHandler,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  CODEBASE_SIDE_PANEL_MIN_WIDTH,
  CODEBASE_SIDE_PANEL_NUDGE_STEP,
  useCodebaseSidePanelWidth,
} from "../lib/codebase-side-panel-layout";
import { resolvePanelResizeShortcut } from "../lib/task-panel-resize-shortcut";
import { fetchGithubConnectionStatus } from "../lib/github-oauth";
import { projectFs } from "../lib/project-fs";
import { navigateToHref } from "../router/navigate-href";

export type CodebaseWorkbenchProject = {
  id: string;
  key: string;
  name: string;
  status: ApiProject["status"] | string;
  priority: number;
  areaId?: string | null;
  area?: ApiProject["area"] | string | null;
  type?: string;
  icon?: string | null;
  organizationId?: string | null;
  localWorkingDirectory?: string | null;
  githubRepository?: string | null;
  summary?: string;
  description?: string;
  startDate?: number | Date | null;
  dueDate?: number | Date | null;
  sortOrder?: number;
};

type Props = {
  project: CodebaseWorkbenchProject;
  projects: CodebaseWorkbenchProject[];
  organizations: ApiOrganization[];
  nestedAreas?: ProjectDetailNestedArea[];
  tasks: ApiTask[];
  taskProgress: { total: number; completed: number };
  routeScope?: ProjectRouteScope | null;
  pathname: string;
  onProjectPatched: (patch: Record<string, unknown>) => void;
  /** Create org from no-match search and assign to the project. */
  onCreateOrganizationFromQuery?: (query: string) => void;
  /** Project task list shown in the main pane on the Tasks tab. */
  tasksPanel?: ReactNode;
  /** Project documents tree shown in the list pane on the Docs tab. */
  docsListPanel?: ReactNode;
  /** Document detail / empty-create shown in the main pane on the Docs tab. */
  docsPanel?: ReactNode;
  fs?: ProjectFsClient;
};

function toApiProject(project: CodebaseWorkbenchProject): ApiProject {
  const now = new Date().toISOString();
  const area =
    project.area === "personal" ||
    project.area === "business" ||
    project.area === "clients"
      ? project.area
      : null;
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    summary: project.summary ?? null,
    description: project.description ?? null,
    organizationId: project.organizationId ?? null,
    areaId: project.areaId ?? null,
    area,
    startDate: project.startDate
      ? new Date(project.startDate).toISOString()
      : null,
    dueDate: project.dueDate ? new Date(project.dueDate).toISOString() : null,
    icon: project.icon ?? null,
    color: null,
    type: (project.type as ApiProject["type"]) ?? "codebase",
    githubRepository: project.githubRepository ?? null,
    localWorkingDirectory: project.localWorkingDirectory ?? null,
    status: project.status as ApiProject["status"],
    priority: project.priority,
    sortOrder: project.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function CodebaseProjectWorkbench({
  project,
  projects,
  organizations,
  nestedAreas = [],
  tasks,
  taskProgress,
  routeScope,
  pathname,
  onProjectPatched,
  onCreateOrganizationFromQuery,
  tasksPanel,
  docsListPanel,
  docsPanel,
  fs = projectFs,
}: Props) {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const { client } = useDesktopApi();
  const { setActiveZone } = useListKeyboardNavigationZone();
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  /** Tab/Enter into PR or commit detail — list keeps 1–5 until this is true. */
  const [detailFocusEngaged, setDetailFocusEngaged] = useState(false);
  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );

  const selection = useMemo(
    () =>
      parseCodebaseWorkbenchPath(pathname, project.key) ?? {
        tab: "tasks" as const,
        commitSha: null,
        pullNumber: null,
        filePath: null,
        documentPath: null,
      },
    [pathname, project.key],
  );

  const [apiProject, setApiProject] = useState(() => toApiProject(project));
  useEffect(() => {
    setApiProject((current) => {
      const mapped = toApiProject(project);
      if (mapped.id !== current.id) return mapped;
      // Keep an optimistic working directory while the parent/PowerSync row
      // still lags (empty) after a successful folder pick.
      const mappedCwd = normalizeWorkingDirectory(mapped.localWorkingDirectory);
      const currentCwd = normalizeWorkingDirectory(
        current.localWorkingDirectory,
      );
      if (currentCwd && !mappedCwd) {
        return {
          ...mapped,
          localWorkingDirectory: current.localWorkingDirectory,
        };
      }
      return mapped;
    });
  }, [project]);

  const apiProjects = useMemo(() => projects.map(toApiProject), [projects]);

  const [selectedCommit, setSelectedCommit] = useState<{
    commit: GithubCommit;
    repository: string;
  } | null>(null);
  const [selectedPull, setSelectedPull] = useState<{
    pullRequest: GithubPullRequest;
    repository: string;
  } | null>(null);
  const [openFilePaths, setOpenFilePaths] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileTreeRefreshToken, setFileTreeRefreshToken] = useState(0);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [githubStatus, setGithubStatus] = useState<{
    connected: boolean | null;
    loading: boolean;
    reason: string | null;
  }>({ connected: null, loading: true, reason: null });
  const [statusRefreshToken, setStatusRefreshToken] = useState(0);
  const [githubRefreshToken, setGithubRefreshToken] = useState(0);
  const wasConnectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setGithubStatus((current) => ({ ...current, loading: true }));
    void fetchGithubConnectionStatus({
      requestJson: <T,>(path: string, init?: RequestInit) =>
        requestJson<T>(path, { ...init, signal: controller.signal }),
    })
      .then((body) => {
        if (controller.signal.aborted) return;
        setGithubStatus({
          connected: body.connected,
          loading: false,
          reason: body.reason ?? null,
        });
        // After Settings token connect, status flips — drop stale list errors.
        if (body.connected && wasConnectedRef.current === false) {
          setGithubRefreshToken((token) => token + 1);
        }
        wasConnectedRef.current = body.connected;
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // Keep a prior successful connected state on transient fetch failures.
        setGithubStatus((current) => ({
          connected: current.connected,
          loading: false,
          reason:
            current.connected === true
              ? current.reason
              : error instanceof Error
                ? error.message
                : "Could not check GitHub connection.",
        }));
        if (wasConnectedRef.current == null) {
          wasConnectedRef.current = false;
        }
      });
    return () => controller.abort();
  }, [requestJson, project.id, statusRefreshToken]);

  // Re-check when focus returns (e.g. after saving a token in Settings).
  useEffect(() => {
    let timer: number | null = null;
    function onFocus() {
      if (document.visibilityState === "hidden") return;
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setStatusRefreshToken((token) => token + 1);
      }, 500);
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const navigateSelection = useCallback(
    (next: {
      tab?: CodebaseGithubListTab;
      commitSha?: string | null;
      pullNumber?: number | null;
      filePath?: string | null;
      documentPath?: string | null;
    }) => {
      navigate(
        getCodebaseWorkbenchHref(
          project.key,
          {
            tab: next.tab ?? selection.tab,
            commitSha:
              next.commitSha !== undefined
                ? next.commitSha
                : selection.commitSha,
            pullNumber:
              next.pullNumber !== undefined
                ? next.pullNumber
                : selection.pullNumber,
            filePath:
              next.filePath !== undefined ? next.filePath : selection.filePath,
            documentPath:
              next.documentPath !== undefined
                ? next.documentPath
                : selection.documentPath,
          },
          routeScope,
        ),
      );
    },
    [navigate, project.key, routeScope, selection],
  );

  const handleTabChange = useCallback(
    (tab: CodebaseGithubListTab) => {
      setSelectedCommit(null);
      setSelectedPull(null);
      setDetailFocusEngaged(false);
      if (tab !== "files") {
        setActiveFilePath(null);
      }
      navigateSelection({
        tab,
        commitSha: null,
        pullNumber: null,
        filePath: tab === "files" ? activeFilePath : null,
        documentPath: tab === "docs" ? selection.documentPath : null,
      });
    },
    [activeFilePath, navigateSelection, selection.documentPath],
  );

  const handleSelectCommit = useCallback(
    (
      commit: GithubCommit,
      repository: string,
      options?: { engageHotkeys?: boolean },
    ) => {
      setSelectedCommit({ commit, repository });
      setSelectedPull(null);
      setDetailFocusEngaged(options?.engageHotkeys === true);
      navigateSelection({
        tab: "commits",
        commitSha: commit.sha,
        pullNumber: null,
        filePath: null,
      });
      if (options?.engageHotkeys) {
        requestAnimationFrame(() => {
          setActiveZone("main", { activate: true });
        });
      }
    },
    [navigateSelection, setActiveZone],
  );

  const handleSelectPull = useCallback(
    (
      pullRequest: GithubPullRequest,
      repository: string,
      options?: { engageHotkeys?: boolean },
    ) => {
      setSelectedPull({ pullRequest, repository });
      setSelectedCommit(null);
      setDetailFocusEngaged(options?.engageHotkeys === true);
      navigateSelection({
        tab: "pulls",
        pullNumber: pullRequest.number,
        commitSha: null,
        filePath: null,
      });
      if (options?.engageHotkeys) {
        requestAnimationFrame(() => {
          setActiveZone("main", { activate: true });
        });
      }
    },
    [navigateSelection, setActiveZone],
  );

  const handleSelectFile = useCallback<SelectProjectFileHandler>(
    (path, options) => {
      setOpenFilePaths((current) => {
        if (options?.newTab) {
          return current.includes(path) ? current : [...current, path];
        }
        if (current.length === 0) return [path];
        const active = activeFilePath;
        if (!active || !current.includes(active)) {
          return current.includes(path) ? current : [...current, path];
        }
        if (current.includes(path)) return current;
        return current.map((entry) => (entry === active ? path : entry));
      });
      setActiveFilePath(path);
      navigateSelection({
        tab: "files",
        filePath: path,
        commitSha: null,
        pullNumber: null,
      });
      if (options?.focusEditor) {
        setEditorFocusRequest((current) => current + 1);
      }
    },
    [activeFilePath, navigateSelection],
  );

  // Tab toggles left list ↔ open detail/editor (files/docs) or main zone (commits/PRs).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isBlockingModalOpen()) return;

      const workbench = document.querySelector("[data-codebase-workbench]");
      if (!workbench) return;

      const tab = selection.tab;
      if (
        tab !== "files" &&
        tab !== "docs" &&
        tab !== "commits" &&
        tab !== "pulls"
      ) {
        return;
      }

      const editorFocused = isCodebaseDetailEditorFocused(event.target);
      if (editorFocused || isCodebaseDetailEditorFocused()) {
        // Leave editor even when shouldHandleGlobalShortcut would yield.
        if (requestCodebaseDetailLeaveFocus()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }

      // Let the global zone Tab handler run unless we own list→detail.
      if (!shouldHandleGlobalShortcut(event)) return;

      const hasFilesDetail =
        tab === "files" &&
        Boolean(activeFilePath) &&
        Boolean(normalizeWorkingDirectory(apiProject.localWorkingDirectory));
      const hasDocsDetail = tab === "docs" && Boolean(docsPanel);
      const hasGithubDetail =
        (tab === "commits" && Boolean(selection.commitSha)) ||
        (tab === "pulls" && selection.pullNumber != null);

      if (hasFilesDetail || hasDocsDetail) {
        if (requestCodebaseDetailEnterFocus()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }

      if (hasGithubDetail) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (detailFocusEngaged) {
          setDetailFocusEngaged(false);
          setActiveZone("content", { activate: true });
        } else {
          setDetailFocusEngaged(true);
          setActiveZone("main", { activate: true });
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    activeFilePath,
    apiProject.localWorkingDirectory,
    detailFocusEngaged,
    docsPanel,
    selection.commitSha,
    selection.pullNumber,
    selection.tab,
    setActiveZone,
  ]);

  // Escape while PR/commit detail owns focus — return to the left list (keep selection).
  useEffect(() => {
    if (!detailFocusEngaged) return;
    if (selection.tab !== "pulls" && selection.tab !== "commits") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (isBlockingModalOpen()) return;
      if (!shouldHandleGlobalShortcut(event)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setDetailFocusEngaged(false);
      setActiveZone("content", { activate: true });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [detailFocusEngaged, selection.tab, setActiveZone]);

  useEffect(() => {
    if (selection.tab === "files" && selection.filePath) {
      setActiveFilePath(selection.filePath);
      setOpenFilePaths((current) =>
        current.includes(selection.filePath!)
          ? current
          : [...current, selection.filePath!],
      );
    }
  }, [selection.tab, selection.filePath]);

  useEffect(() => {
    if (selection.tab !== "commits" || !selection.commitSha) {
      if (selection.tab !== "commits") setSelectedCommit(null);
      return;
    }
    if (selectedCommit?.commit.sha === selection.commitSha) return;

    const sha = selection.commitSha;
    const controller = new AbortController();
    setDetailError(null);
    void requestJson<{ commit: GithubCommit; repository?: string }>(
      `/api/v1/projects/${encodeURIComponent(project.id)}/github/commits/${encodeURIComponent(sha)}`,
      { signal: controller.signal },
    )
      .then((body) => {
        setSelectedCommit({
          commit: body.commit,
          repository: body.repository ?? apiProject.githubRepository ?? "",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDetailError(
          error instanceof Error ? error.message : "Could not load commit.",
        );
      });
    return () => controller.abort();
  }, [
    apiProject.githubRepository,
    project.id,
    requestJson,
    selectedCommit?.commit.sha,
    selection.commitSha,
    selection.tab,
  ]);

  useEffect(() => {
    if (selection.tab !== "pulls" || selection.pullNumber == null) {
      if (selection.tab !== "pulls") setSelectedPull(null);
      return;
    }
    if (selectedPull?.pullRequest.number === selection.pullNumber) return;

    const number = selection.pullNumber;
    const controller = new AbortController();
    setDetailError(null);
    void requestJson<{
      pullRequest: GithubPullRequest;
      repository?: string;
    }>(
      `/api/v1/projects/${encodeURIComponent(project.id)}/github/pulls/${number}`,
      { signal: controller.signal },
    )
      .then((body) => {
        setSelectedPull({
          pullRequest: body.pullRequest,
          repository: body.repository ?? apiProject.githubRepository ?? "",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDetailError(
          error instanceof Error
            ? error.message
            : "Could not load pull request.",
        );
      });
    return () => controller.abort();
  }, [
    apiProject.githubRepository,
    project.id,
    requestJson,
    selectedPull?.pullRequest.number,
    selection.pullNumber,
    selection.tab,
  ]);

  const workingDirectory = normalizeWorkingDirectory(
    apiProject.localWorkingDirectory,
  );

  const {
    containerRef,
    panelWidth: sidePanelWidth,
    beginResize: beginSidePanelResize,
    nudgePanelWidth: nudgeSidePanelWidth,
    isResizing: isSidePanelResizing,
  } = useCodebaseSidePanelWidth(project.id);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const direction = resolvePanelResizeShortcut(event);
      if (!direction) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const delta =
        direction === "shrink-left"
          ? -CODEBASE_SIDE_PANEL_NUDGE_STEP
          : CODEBASE_SIDE_PANEL_NUDGE_STEP;
      nudgeSidePanelWidth(delta);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [nudgeSidePanelWidth]);

  const showCommitDetail =
    selection.tab === "commits" && Boolean(selectedCommit);
  const showPullDetail =
    selection.tab === "pulls" && Boolean(selectedPull) && !selectedCommit;
  const showFileDetail =
    selection.tab === "files" &&
    Boolean(workingDirectory) &&
    Boolean(activeFilePath);

  let detail: ReactNode = null;
  if (detailError && (selection.commitSha || selection.pullNumber != null)) {
    detail = (
      <div className="console-pane console-pane--commit-detail">
        <div className="console-pane-body">
          <p className="console-github-pane-error" role="alert">
            {detailError}
          </p>
        </div>
      </div>
    );
  } else if (showCommitDetail && selectedCommit) {
    detail = (
      <CommitDetailPane
        projectId={project.id}
        commit={selectedCommit.commit}
        repository={selectedCommit.repository}
        requestJson={requestJson}
        parentPullRequest={selectedPull?.pullRequest ?? null}
        hotkeysEnabled={detailFocusEngaged}
      />
    );
  } else if (showPullDetail && selectedPull) {
    detail = (
      <PullRequestDetailPane
        projectId={project.id}
        pullRequest={selectedPull.pullRequest}
        repository={selectedPull.repository}
        requestJson={requestJson}
        onSelectCommit={handleSelectCommit}
        hotkeysEnabled={detailFocusEngaged}
      />
    );
  } else if (showFileDetail && workingDirectory && activeFilePath) {
    detail = (
      <FileDetailPane
        workingDirectory={workingDirectory}
        openPaths={openFilePaths}
        activePath={activeFilePath}
        fs={fs}
        editorFocusRequest={editorFocusRequest}
        onActivatePath={(path) => {
          setActiveFilePath(path);
          navigateSelection({ tab: "files", filePath: path });
        }}
        onClosePath={(path) => {
          setOpenFilePaths((current) => {
            const next = current.filter((entry) => entry !== path);
            const nextActive =
              activeFilePath === path
                ? (next[next.length - 1] ?? null)
                : activeFilePath;
            setActiveFilePath(nextActive);
            navigateSelection({
              tab: "files",
              filePath: nextActive,
            });
            return next;
          });
        }}
        onFileDeleted={(path) => {
          setFileTreeRefreshToken((token) => token + 1);
          setOpenFilePaths((current) =>
            current.filter((entry) => entry !== path),
          );
          if (activeFilePath === path) {
            setActiveFilePath(null);
            navigateSelection({ tab: "files", filePath: null });
          }
        }}
      />
    );
  } else if (selection.tab === "commits" || selection.tab === "pulls") {
    detail = (
      <div className="console-pane">
        <div className="console-pane-body">
          {!githubStatus.loading && githubStatus.connected === false ? (
            <div className="console-github-pane-status">
              <p>GitHub is not connected.</p>
              {githubStatus.reason ? <p>{githubStatus.reason}</p> : null}
              <p>
                <Link to="/settings/$tab" params={{ tab: "github" }}>
                  Add a GitHub token in Settings
                </Link>{" "}
                to browse commits and pull requests.
              </p>
              <p>
                <button
                  type="button"
                  className="console-github-pane-retry"
                  onClick={() => setStatusRefreshToken((token) => token + 1)}
                >
                  Retry connection check
                </button>
              </p>
            </div>
          ) : !apiProject.githubRepository ? (
            <div className="console-github-pane-status">
              <p>
                Select a GitHub repository in the project header to load
                history.
              </p>
            </div>
          ) : (
            <div className="console-github-pane-status">
              <p>Select an item from the list.</p>
            </div>
          )}
        </div>
      </div>
    );
  } else if (selection.tab === "files") {
    detail = (
      <div className="console-pane">
        <div className="console-pane-body">
          <div className="console-github-pane-status">
            <p>
              {workingDirectory
                ? "Select a file from the tree."
                : "Set a working directory to browse local files."}
            </p>
          </div>
        </div>
      </div>
    );
  } else if (selection.tab === "docs") {
    detail = (
      <div className="codebase-project-workbench__docs">
        {docsPanel ?? (
          <div className="console-pane">
            <div className="console-pane-body">
              <div className="console-github-pane-status">
                <p>Select a document from the list.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } else if (selection.tab === "tasks") {
    detail = (
      <div className="codebase-project-workbench__tasks" data-list-board-view>
        {tasksPanel ?? (
          <div className="console-github-pane-status">
            <p>No tasks to show.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={[
        "codebase-project-workbench",
        isSidePanelResizing ? "is-resizing" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-codebase-workbench
      data-content-detail
    >
      <div className="codebase-project-workbench__list">
        <div className="console-pane console-pane--overview">
          <CodebaseProjectOverviewPane
            project={apiProject}
            projects={apiProjects}
            onProjectUpdated={(updated) => {
              setApiProject(updated);
              onProjectPatched({
                name: updated.name,
                key: updated.key,
                status: updated.status,
                priority: updated.priority,
                area: updated.area,
                areaId: updated.areaId,
                organizationId: updated.organizationId,
                icon: updated.icon,
                type: updated.type,
                githubRepository: updated.githubRepository,
                localWorkingDirectory: updated.localWorkingDirectory,
                startDate: updated.startDate,
                dueDate: updated.dueDate,
                summary: updated.summary,
                description: updated.description,
              });
            }}
            requestJson={requestJson}
            fs={fs}
            githubListTab={selection.tab}
            onGithubListTabChange={handleTabChange}
            selectedCommitSha={selection.commitSha}
            onSelectCommit={handleSelectCommit}
            selectedPullNumber={selection.pullNumber}
            onSelectPullRequest={handleSelectPull}
            githubDetailEngaged={detailFocusEngaged}
            selectedFilePath={activeFilePath}
            onSelectFile={handleSelectFile}
            onFileEntryDeleted={() => {
              setFileTreeRefreshToken((token) => token + 1);
            }}
            fileTreeRefreshToken={fileTreeRefreshToken}
            docsListPanel={docsListPanel}
            githubRefreshToken={githubRefreshToken}
            showHeader
            organizations={organizations}
            nestedAreas={nestedAreas}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
            tasks={tasks}
            taskProgress={taskProgress}
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side panel"
          aria-valuemin={CODEBASE_SIDE_PANEL_MIN_WIDTH}
          aria-valuenow={sidePanelWidth}
          title="Drag to resize · ⌥- / ⌥="
          className="desktop-codebase-side-panel-resize"
          onPointerDown={(event) => {
            event.preventDefault();
            beginSidePanelResize(event.clientX);
          }}
        />
      </div>
      <div className="codebase-project-workbench__detail">{detail}</div>
    </div>
  );
}
