"use client";

import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  GithubCommit,
  GithubPullRequest,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  CommandPaletteProvider,
  ComposeModal,
  ListKeyboardNavigationProvider,
  SettingsSidePanelNavView,
  getDefaultSettingsHref,
  isBlockingModalOpen,
  isTargetInsideBlockingModal,
  shouldHandleGlobalShortcut,
  useCommandPalette,
  useComposeShortcut,
  useEscapeBackNavigation,
  useListKeyboardNavigationZone,
  useSettingsShortcut,
  useTaskPropertyDropdownShortcuts,
  type ComposeModalCreateTaskInput,
  type ComposeModalProject,
  type InboxListItemLinkComponent,
  type SettingsSidePanelLinkComponent,
} from "@backsteros/ui";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { AppTabsProvider } from "@/components/app-tabs-provider";
import { CommitDetailPane } from "@/components/commit-detail-pane";
import { PullRequestDetailPane } from "@/components/pull-request-detail-pane";
import { ConsoleAppTabs } from "@/components/console-app-tabs";
import {
  AttentionInboxProvider,
  InboxAttentionDetail,
  InboxAttentionList,
} from "@/components/inbox-attention-pane";
import { ProjectOverviewPane } from "@/components/project-overview-pane";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ConsoleSettingsPage } from "@/components/settings-page";
import { StatusBarAgents } from "@/components/status-bar-agents";
import { StatusBarMetrics } from "@/components/status-bar-metrics";
import { TaskSidebar } from "@/components/task-sidebar";
import { TerminalWorkspace } from "@/components/terminal-workspace";
import {
  CONSOLE_LIST_PANEL_MAX_WIDTH,
  CONSOLE_LIST_PANEL_MIN_WIDTH,
  useConsoleListPanelWidth,
} from "@/lib/console-list-panel-width";
import { useApiResource, useConsoleApi } from "@/lib/api-context";
import {
  emptyAgentActivitySummary,
  type AgentActivitySummary,
} from "@/lib/agent-activity";
import {
  evaluateAgentTurnOutcome,
  type AgentHoldDecision,
} from "@/lib/agent-hold";
import {
  holdTaskForAgent,
  markTaskInProgressForAgent,
  reviewTaskForAgent,
} from "@/lib/agent-task-mutations";
import type { AgentTurnCompletedEvent } from "@/lib/agent-turn";
import type {
  AgentAttachRequest,
  AgentEndRequest,
} from "@/lib/cursor-agent-cli";
import {
  buildConsolePath,
  buildSettingsPath,
  emptyConsoleRoute,
  parseConsoleSlug,
  type GithubListTab,
  type GithubPullDetailTab,
} from "@/lib/console-path";
import { getConsoleTabTitle } from "@/lib/console-tab-title";
import { TerminalDirectoryGate } from "@/components/terminal-directory-gate";
import {
  clearLegacyLocalDirectory,
  normalizeWorkingDirectory,
  peekLegacyLocalDirectory,
} from "@/lib/project-workspace";
import { DEVELOPMENT_SETTINGS_NAV_TABS } from "@/lib/settings-tabs";

const TERMINAL_COLLAPSED_KEY = "backsteros-development.terminal-collapsed";
const PROJECTS_COLLAPSED_KEY = "backsteros-development.projects-collapsed";
const TASKS_COLLAPSED_KEY = "backsteros-development.tasks-collapsed";

/** Content-area layout stage (projects rail is always visible). */
type ContentStage = "blank" | "project" | "task-focus";

const STAGE_MS = 350;

/**
 * Mount/unmount with a real enter transition: first paint hidden, then shown
 * on the next frames so opacity/transform actually interpolate.
 */
function useStagePresence(open: boolean, ms: number = STAGE_MS) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setShown(false);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [ms, open]);

  return { mounted, shown };
}

function createInboxPanelLink(
  navigate: (href: string) => void,
): InboxListItemLinkComponent {
  return function InboxPanelLink({
    to,
    className,
    children,
    onClick,
    ...rest
  }) {
    return (
      <a
        href={to}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          onClick?.();
          navigate(to);
        }}
        {...rest}
      >
        {children}
      </a>
    );
  };
}

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function routeFromPathname(pathname: string) {
  const parts = pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  return parseConsoleSlug(parts);
}

function stubPullRequest(number: number, repository: string): GithubPullRequest {
  return {
    number,
    title: `Pull request #${number}`,
    state: "open",
    draft: false,
    body: null,
    authorLogin: null,
    createdAt: null,
    updatedAt: null,
    closedAt: null,
    mergedAt: null,
    htmlUrl: `https://github.com/${repository}/pull/${number}`,
    headRef: null,
    baseRef: null,
    commitsCount: null,
    commentsCount: null,
    changedFilesCount: null,
    additions: null,
    deletions: null,
  };
}

function stubCommit(sha: string, repository: string): GithubCommit {
  const shortSha = sha.slice(0, 7);
  return {
    sha,
    shortSha,
    message: "Loading…",
    authorName: null,
    authorLogin: null,
    authoredAt: null,
    htmlUrl: `https://github.com/${repository}/commit/${encodeURIComponent(sha)}`,
  };
}

function ConsoleEscapeBackNavigation({
  inboxActive,
  selectedProjectId,
  selectedTaskId,
  selectedCommitSha,
  selectedPullNumber,
  onClearCommit,
  onClearPullRequest,
  onClearInboxTask,
}: {
  inboxActive: boolean;
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  selectedCommitSha: string | null;
  selectedPullNumber: number | null;
  onClearCommit: () => void;
  onClearPullRequest: () => void;
  onClearInboxTask?: () => void;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();

  // Treat project task lists / inbox as section homes (Escape should not leave them).
  const escapePathname =
    selectedTaskId && selectedProjectId
      ? `/${selectedProjectId}/${selectedTaskId}`
      : selectedTaskId && inboxActive
        ? `/inbox/${selectedTaskId}`
        : selectedCommitSha && selectedPullNumber && selectedProjectId
          ? `/${selectedProjectId}/pull/${selectedPullNumber}/commit/${selectedCommitSha}`
          : selectedCommitSha && selectedProjectId
            ? `/${selectedProjectId}/commit/${selectedCommitSha}`
            : selectedPullNumber && selectedProjectId
              ? `/${selectedProjectId}/pull/${selectedPullNumber}`
              : selectedProjectId
                ? "/projects"
                : "/inbox";

  const goBack = useCallback(() => {
    if (selectedCommitSha) {
      onClearCommit();
      return;
    }
    if (selectedPullNumber) {
      onClearPullRequest();
      return;
    }
    if (inboxActive && selectedTaskId && onClearInboxTask) {
      onClearInboxTask();
      return;
    }
    window.history.back();
  }, [
    inboxActive,
    onClearCommit,
    onClearInboxTask,
    onClearPullRequest,
    selectedCommitSha,
    selectedPullNumber,
    selectedTaskId,
  ]);

  // Project task Escape is handled by TaskSidebar; inbox task Escape is here.
  useEscapeBackNavigation({
    enabled: !selectedTaskId || (inboxActive && Boolean(selectedTaskId)),
    pathname: escapePathname,
    commandPaletteOpen,
    canGoBack: true,
    onGoBack: goBack,
  });

  return null;
}

function ConsoleSettingsShortcut({
  enabled,
  onNavigate,
}: {
  enabled: boolean;
  onNavigate: (href: string) => void;
}) {
  const { open, setOpen } = useCommandPalette();
  useSettingsShortcut({
    enabled,
    commandPaletteOpen: open,
    closePalette: () => setOpen(false),
    onNavigate,
  });
  return null;
}

/** S / P / A / ⇧D (etc.) open property dropdowns on the focused task row. */
function ConsoleTaskPropertyShortcuts({ enabled }: { enabled: boolean }) {
  const { open: commandPaletteOpen } = useCommandPalette();
  useTaskPropertyDropdownShortcuts({
    enabled,
    commandPaletteOpen,
  });
  return null;
}

/** Plain C opens the compose modal (same as web/desktop). */
function ConsoleComposeShortcut({
  enabled,
  onCompose,
}: {
  enabled: boolean;
  onCompose: () => void;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();
  useComposeShortcut({
    enabled,
    commandPaletteOpen,
    onCompose,
  });
  return null;
}

/** 1 = Commits, 2 = PRs on the project GitHub list; focuses that list for j/k. */
function ConsoleGithubListTabShortcut({
  enabled,
  onSelectTab,
}: {
  enabled: boolean;
  onSelectTab: (tab: GithubListTab) => void;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();
  const { setActiveZone } = useListKeyboardNavigationZone();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) return;

      const tab: GithubListTab | null =
        event.key === "1"
          ? "commits"
          : event.key === "2"
            ? "pulls"
            : null;
      if (!tab) return;

      event.preventDefault();
      event.stopPropagation();
      onSelectTab(tab);
      setActiveZone("content", { activate: true });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, onSelectTab, setActiveZone]);

  return null;
}

export function ConsoleShell() {
  const { client, refresh } = useConsoleApi();
  const initialPathname = usePathname() || "/";
  const [locationPath, setLocationPath] = useState(initialPathname);
  const route = useMemo(
    () => routeFromPathname(locationPath),
    [locationPath],
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    route.projectId,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    route.taskId,
  );
  const [activeSessionTabId, setActiveSessionTabId] = useState<string | null>(
    route.tabId,
  );
  const [selectedTaskMeta, setSelectedTaskMeta] = useState<{
    id: string;
    title: string;
    projectId?: string | null;
  } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<{
    commit: GithubCommit;
    repository: string;
  } | null>(null);
  const [selectedPullRequest, setSelectedPullRequest] = useState<{
    pullRequest: GithubPullRequest;
    repository: string;
  } | null>(null);
  const [githubListTab, setGithubListTab] = useState<GithubListTab>(
    () => route.githubListTab ?? "commits",
  );
  const [pullDetailTab, setPullDetailTab] = useState<GithubPullDetailTab>(
    () => route.pullTab ?? "conversation",
  );
  // Layout stage is driven by selection. Deep links: task → split with
  // terminal; project only → overview + task list (main pane visible).
  const [terminalCollapsed, setTerminalCollapsed] = useState(() => false);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  /** Keep TerminalWorkspace mounted after first task focus so parked PTYs live. */
  const [terminalEverOpened, setTerminalEverOpened] = useState(
    () => Boolean(route.taskId),
  );
  const [agentSummary, setAgentSummary] = useState<AgentActivitySummary>(
    emptyAgentActivitySummary,
  );
  const [workingTaskIds, setWorkingTaskIds] = useState<string[]>([]);
  const [workingProjectIds, setWorkingProjectIds] = useState<string[]>([]);
  const [agentOpenTaskIds, setAgentOpenTaskIds] = useState<string[]>([]);
  const [activityFeedRevision, setActivityFeedRevision] = useState(0);
  const agentStatusHandlersRef = useRef<{
    onBecameWorking: (taskId: string) => void;
    onBecameIdle: (taskId: string) => void;
    onBecameAttention: (taskId: string) => void;
    onNeedsHold: (
      taskId: string,
      decision: AgentHoldDecision,
      options?: { parentCommentId?: string | null },
    ) => void;
    onNeedsReview?: (taskId: string) => void;
  } | null>(null);
  /** Hold-thread root comment id per task for the in-flight reply-triggered turn. */
  const replyParentCommentByTaskRef = useRef(new Map<string, string>());
  const [agentAttachRequest, setAgentAttachRequest] =
    useState<AgentAttachRequest | null>(null);
  const [agentEndRequest, setAgentEndRequest] =
    useState<AgentEndRequest | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const skippingUrlSyncRef = useRef(false);

  useEffect(() => {
    setProjectsCollapsed(readFlag(PROJECTS_COLLAPSED_KEY));
    setTasksCollapsed(readFlag(TASKS_COLLAPSED_KEY));
  }, []);

  useEffect(() => {
    if (selectedTaskId) {
      setTerminalEverOpened(true);
    }
  }, [selectedTaskId]);

  const toggleProjectsCollapsed = useCallback(() => {
    setProjectsCollapsed((current) => {
      const next = !current;
      writeFlag(PROJECTS_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const toggleTasksCollapsed = useCallback(() => {
    setTasksCollapsed((current) => {
      const next = !current;
      writeFlag(TASKS_COLLAPSED_KEY, next);
      if (next) {
        setTerminalCollapsed((terminalHidden) => {
          if (terminalHidden) {
            writeFlag(TERMINAL_COLLAPSED_KEY, false);
            return false;
          }
          return terminalHidden;
        });
      }
      return next;
    });
  }, []);

  const toggleTerminalCollapsed = useCallback(() => {
    setTerminalCollapsed((current) => {
      const next = !current;
      writeFlag(TERMINAL_COLLAPSED_KEY, next);
      if (next) {
        setTasksCollapsed((tasksHidden) => {
          if (tasksHidden) {
            writeFlag(TASKS_COLLAPSED_KEY, false);
            return false;
          }
          return tasksHidden;
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Allow panel shortcuts while the embedded terminal is focused (xterm
      // uses a hidden textarea that would otherwise block global shortcuts).
      const target = event.target;
      const inXterm =
        target instanceof HTMLElement && Boolean(target.closest(".xterm"));
      if (inXterm) {
        if (
          isBlockingModalOpen() &&
          !isTargetInsideBlockingModal(event.target)
        ) {
          return;
        }
      } else if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      // [ — toggle project sidebar
      if (
        !event.shiftKey &&
        (event.key === "[" || event.code === "BracketLeft")
      ) {
        event.preventDefault();
        toggleProjectsCollapsed();
        return;
      }

      // ⇧[ — toggle tasks list panel
      if (event.shiftKey && event.code === "BracketLeft") {
        event.preventDefault();
        toggleTasksCollapsed();
        return;
      }

      // ] — same as the Tasks header expand/collapse control (toggle terminal)
      if (
        !event.shiftKey &&
        (event.key === "]" || event.code === "BracketRight")
      ) {
        event.preventDefault();
        toggleTerminalCollapsed();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [
    toggleProjectsCollapsed,
    toggleTasksCollapsed,
    toggleTerminalCollapsed,
  ]);

  const loadProjects = useCallback(
    async (client: BacksterosApiClient, signal: AbortSignal) => {
      const result = await client.requestJson<{ projects: ApiProject[] }>(
        "/api/v1/projects?type=codebase",
        { signal },
      );
      return result.projects;
    },
    [],
  );

  const {
    data: projects,
    error,
    loading,
    reload,
    setData: setProjects,
  } = useApiResource(loadProjects, []);

  const projectList = projects ?? [];
  const projectsById = useMemo(() => {
    const map = new Map<string, ApiProject>();
    for (const project of projectList) map.set(project.id, project);
    return map;
  }, [projectList]);

  // Apply URL → state (refresh, back/forward, shared links).
  useEffect(() => {
    skippingUrlSyncRef.current = true;

    if (route.settings) {
      // Keep workspace selection while settings is open so Back restores context.
    } else if (route.inbox) {
      setSelectedProjectId(null);
      setSelectedTaskId((current) =>
        current === route.taskId ? current : route.taskId,
      );
      setActiveSessionTabId(null);
      setSelectedCommit(null);
      setSelectedPullRequest(null);
    } else {
      if (route.projectId) {
        setSelectedProjectId((current) =>
          current === route.projectId ? current : route.projectId,
        );
      } else {
        setSelectedProjectId(null);
      }
      setSelectedTaskId((current) =>
        current === route.taskId ? current : route.taskId,
      );
      setActiveSessionTabId((current) =>
        current === route.tabId ? current : route.tabId,
      );
      if (route.githubListTab) {
        setGithubListTab(route.githubListTab);
      }
      setPullDetailTab(route.pullTab ?? "conversation");

      if (route.commitSha || route.pullNumber != null) {
        // Detail hydration is handled in a dedicated effect once the project
        // repository is known.
      } else {
        setSelectedCommit(null);
        setSelectedPullRequest(null);
      }

      if (route.taskId) {
        setSelectedCommit(null);
        setSelectedPullRequest(null);
        writeFlag(TERMINAL_COLLAPSED_KEY, false);
        setTerminalCollapsed(false);
      }
    }
    const frame = requestAnimationFrame(() => {
      skippingUrlSyncRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    route.commitSha,
    route.githubListTab,
    route.inbox,
    route.projectId,
    route.pullNumber,
    route.pullTab,
    route.settings,
    route.taskId,
    route.tabId,
  ]);

  // Validate deep-linked project ids; do not auto-select a default project.
  useEffect(() => {
    if (route.inbox || route.settings) return;
    if (projectList.length === 0) return;
    if (!route.projectId) return;
    if (
      projectsById.has(route.projectId) &&
      selectedProjectId !== route.projectId
    ) {
      setSelectedProjectId(route.projectId);
    }
  }, [
    projectList,
    projectsById,
    route.inbox,
    route.projectId,
    route.settings,
    selectedProjectId,
  ]);

  // Hydrate commit / PR detail from deep links.
  useEffect(() => {
    if (route.inbox || route.settings) return;
    if (!selectedProjectId) return;
    const project = projectsById.get(selectedProjectId);
    const repository = project?.githubRepository ?? null;
    if (!repository) return;

    const nestedPullNumber = route.commitSha ? route.pullNumber : null;

    if (route.commitSha) {
      const sha = route.commitSha;
      if (nestedPullNumber == null) {
        setSelectedPullRequest(null);
        setGithubListTab("commits");
      } else {
        setGithubListTab("pulls");
        setPullDetailTab(route.pullTab ?? "commits");
        setSelectedPullRequest((current) => {
          if (current && current.pullRequest.number === nestedPullNumber) {
            return current;
          }
          return {
            pullRequest: stubPullRequest(nestedPullNumber, repository),
            repository,
          };
        });
      }
      setSelectedCommit((current) => {
        if (
          current &&
          (current.commit.sha === sha || current.commit.sha.startsWith(sha))
        ) {
          return current;
        }
        return { commit: stubCommit(sha, repository), repository };
      });

      const controller = new AbortController();
      void (async () => {
        try {
          const query = new URLSearchParams({ branch: sha, page: "1" });
          const result = await client.requestJson<{
            commits: GithubCommit[];
          }>(
            `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/github/commits?${query.toString()}`,
            { signal: controller.signal },
          );
          const match =
            result.commits.find(
              (entry) => entry.sha === sha || entry.sha.startsWith(sha),
            ) ?? result.commits[0];
          if (!match) return;
          setSelectedCommit({ commit: match, repository });
        } catch {
          /* keep stub; detail pane still shows sha */
        }
      })();
      return () => controller.abort();
    }

    if (route.pullNumber != null) {
      const pullNumber = route.pullNumber;
      setSelectedCommit(null);
      setSelectedPullRequest((current) => {
        if (current && current.pullRequest.number === pullNumber) {
          return current;
        }
        return {
          pullRequest: stubPullRequest(pullNumber, repository),
          repository,
        };
      });
      setGithubListTab("pulls");
      setPullDetailTab(route.pullTab ?? "conversation");
    }
  }, [
    client,
    projectsById,
    route.commitSha,
    route.inbox,
    route.pullNumber,
    route.pullTab,
    route.settings,
    selectedProjectId,
  ]);

  // Keep the address bar in sync without remounting Next.js route trees.
  useEffect(() => {
    if (skippingUrlSyncRef.current) return;
    if (route.settings) return;

    let nextPath: string;
    if (selectedProjectId) {
      if (selectedTaskId) {
        nextPath = buildConsolePath({
          ...emptyConsoleRoute(),
          projectId: selectedProjectId,
          taskId: selectedTaskId,
          tabId: activeSessionTabId,
        });
      } else if (selectedCommit) {
        nextPath = buildConsolePath({
          ...emptyConsoleRoute(),
          projectId: selectedProjectId,
          commitSha: selectedCommit.commit.sha,
          pullNumber: selectedPullRequest?.pullRequest.number ?? null,
          pullTab: selectedPullRequest ? "commits" : null,
          githubListTab: selectedPullRequest ? "pulls" : "commits",
        });
      } else if (selectedPullRequest) {
        nextPath = buildConsolePath({
          ...emptyConsoleRoute(),
          projectId: selectedProjectId,
          pullNumber: selectedPullRequest.pullRequest.number,
          pullTab:
            pullDetailTab === "conversation" ? null : pullDetailTab,
          githubListTab: "pulls",
        });
      } else {
        nextPath = buildConsolePath({
          ...emptyConsoleRoute(),
          projectId: selectedProjectId,
          githubListTab,
        });
      }
    } else if (route.inbox) {
      nextPath = buildConsolePath({
        ...emptyConsoleRoute(),
        inbox: true,
        taskId: selectedTaskId,
      });
    } else {
      nextPath = "/inbox";
    }

    if (nextPath === locationPath) return;
    window.history.replaceState(window.history.state, "", nextPath);
    setLocationPath(nextPath);
  }, [
    activeSessionTabId,
    githubListTab,
    locationPath,
    pullDetailTab,
    route.inbox,
    route.settings,
    selectedCommit,
    selectedProjectId,
    selectedPullRequest,
    selectedTaskId,
  ]);

  // Normalize /settings → /settings/general (and drop excluded tabs).
  useEffect(() => {
    if (!route.settings) return;
    const allowed = DEVELOPMENT_SETTINGS_NAV_TABS.some(
      (tab) => tab.id === route.settingsTab,
    );
    if (route.settingsTab && allowed) return;
    const nextPath = buildSettingsPath("general");
    if (nextPath === locationPath) return;
    skippingUrlSyncRef.current = true;
    window.history.replaceState(window.history.state, "", nextPath);
    setLocationPath(nextPath);
    requestAnimationFrame(() => {
      skippingUrlSyncRef.current = false;
    });
  }, [locationPath, route.settings, route.settingsTab]);

  useEffect(() => {
    const onPopState = () => {
      skippingUrlSyncRef.current = true;
      setLocationPath(window.location.pathname || "/");
      requestAnimationFrame(() => {
        skippingUrlSyncRef.current = false;
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const onProjectUpdated = useCallback(
    (updated: ApiProject) => {
      setProjects((current) =>
        (current ?? []).map((entry) =>
          entry.id === updated.id ? updated : entry,
        ),
      );
    },
    [setProjects],
  );

  const saveProjectWorkingDirectory = useCallback(
    async (projectId: string, directory: string) => {
      const updated = await client.requestJson<ApiProject>(
        `/api/v1/projects/${encodeURIComponent(projectId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localWorkingDirectory: directory }),
        },
      );
      onProjectUpdated(updated);
      return updated;
    },
    [client, onProjectUpdated],
  );

  const selectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedTaskId(null);
    setActiveSessionTabId(null);
    setSelectedTaskMeta(null);
    setSelectedCommit(null);
    setSelectedPullRequest(null);
    setGithubListTab("commits");
    setPullDetailTab("conversation");
    writeFlag(TERMINAL_COLLAPSED_KEY, false);
    setTerminalCollapsed(false);
  }, []);

  const selectInbox = useCallback(() => {
    skippingUrlSyncRef.current = true;
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveSessionTabId(null);
    setSelectedTaskMeta(null);
    setSelectedCommit(null);
    setSelectedPullRequest(null);
    setGithubListTab("commits");
    setPullDetailTab("conversation");
    window.history.pushState(window.history.state, "", "/inbox");
    setLocationPath("/inbox");
    requestAnimationFrame(() => {
      skippingUrlSyncRef.current = false;
    });
  }, []);

  const settingsReturnPathRef = useRef("/inbox");

  const navigateConsolePath = useCallback((href: string) => {
    const nextPath = href.startsWith("/") ? href : `/${href}`;
    skippingUrlSyncRef.current = true;
    window.history.pushState(window.history.state, "", nextPath);
    setLocationPath(nextPath);
    requestAnimationFrame(() => {
      skippingUrlSyncRef.current = false;
    });
  }, []);

  const InboxPanelLink = useMemo(
    () => createInboxPanelLink(navigateConsolePath),
    [navigateConsolePath],
  );

  const openAppSettings = useCallback(() => {
    if (!locationPath.startsWith("/settings")) {
      settingsReturnPathRef.current = locationPath || "/inbox";
    }
    navigateConsolePath(getDefaultSettingsHref());
  }, [locationPath, navigateConsolePath]);

  const closeSettings = useCallback(() => {
    navigateConsolePath(settingsReturnPathRef.current || "/inbox");
  }, [navigateConsolePath]);

  const openSettingsFromShortcut = useCallback(
    (href: string) => {
      if (!locationPath.startsWith("/settings")) {
        settingsReturnPathRef.current = locationPath || "/inbox";
      }
      navigateConsolePath(href);
    },
    [locationPath, navigateConsolePath],
  );

  const SettingsNavLink = useMemo<SettingsSidePanelLinkComponent>(() => {
    function Link({
      to,
      className,
      children,
      onClick,
      ...rest
    }: {
      to: string;
      className?: string;
      "aria-current"?: "page";
      children: ReactNode;
      onClick?: () => void;
    }) {
      return (
        <a
          href={to}
          className={className}
          {...rest}
          onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            onClick?.();
            navigateConsolePath(to);
          }}
        >
          {children}
        </a>
      );
    }
    return Link;
  }, [navigateConsolePath]);

  const clearSelectedCommit = useCallback(() => {
    setSelectedCommit(null);
    if (selectedPullRequest) {
      setGithubListTab("pulls");
      setPullDetailTab("commits");
    } else {
      setGithubListTab("commits");
    }
  }, [selectedPullRequest]);

  const navigateToParentPull = useCallback(() => {
    setSelectedCommit(null);
    setGithubListTab("pulls");
    setPullDetailTab("commits");
  }, []);

  const clearSelectedPullRequest = useCallback(() => {
    setSelectedPullRequest(null);
    setSelectedCommit(null);
    setPullDetailTab("conversation");
    setGithubListTab("pulls");
  }, []);

  const selectCommit = useCallback(
    (
      commit: GithubCommit,
      repository: string,
      options?: { fromPullRequest?: GithubPullRequest },
    ) => {
      setSelectedTaskId(null);
      setActiveSessionTabId(null);
      setSelectedTaskMeta(null);
      if (options?.fromPullRequest) {
        setSelectedPullRequest({
          pullRequest: options.fromPullRequest,
          repository,
        });
        setPullDetailTab("commits");
        setGithubListTab("pulls");
      } else {
        setSelectedPullRequest(null);
        setPullDetailTab("conversation");
        setGithubListTab("commits");
      }
      setSelectedCommit({ commit, repository });
    },
    [],
  );

  const selectPullRequest = useCallback(
    (pullRequest: GithubPullRequest, repository: string) => {
      setSelectedTaskId(null);
      setActiveSessionTabId(null);
      setSelectedTaskMeta(null);
      setSelectedCommit(null);
      setGithubListTab("pulls");
      setPullDetailTab("conversation");
      setSelectedPullRequest({ pullRequest, repository });
    },
    [],
  );

  const selectGithubListTab = useCallback((tab: GithubListTab) => {
    setGithubListTab(tab);
    setSelectedCommit(null);
    setSelectedPullRequest(null);
    setPullDetailTab("conversation");
  }, []);

  const selectPullDetailTab = useCallback((tab: GithubPullDetailTab) => {
    setPullDetailTab(tab);
  }, []);

  const selectTaskId = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
    if (taskId) {
      setSelectedCommit(null);
      setSelectedPullRequest(null);
      setPullDetailTab("conversation");
      writeFlag(TERMINAL_COLLAPSED_KEY, false);
      setTerminalCollapsed(false);
    } else {
      setActiveSessionTabId(null);
      setSelectedTaskMeta(null);
    }
  }, []);

  const handleWorkingTaskIdsChange = useCallback((taskIds: string[]) => {
    setWorkingTaskIds(taskIds);
  }, []);

  const handleWorkingProjectIdsChange = useCallback((projectIds: string[]) => {
    setWorkingProjectIds(projectIds);
  }, []);

  const handleAgentOpenTaskIdsChange = useCallback(
    (taskIds: readonly string[]) => {
      setAgentOpenTaskIds([...taskIds]);
    },
    [],
  );

  const handleTaskAgentBecameWorking = useCallback(
    (taskId: string) => {
      // Always PATCH — panel handlers only refresh local lists so a missing
      // or stale handler ref cannot skip the In Progress move.
      agentStatusHandlersRef.current?.onBecameWorking?.(taskId);
      void markTaskInProgressForAgent(client, taskId).then((ok) => {
        if (ok) setActivityFeedRevision((current) => current + 1);
      });
    },
    [client],
  );

  const handleTaskAgentBecameIdle = useCallback((taskId: string) => {
    agentStatusHandlersRef.current?.onBecameIdle(taskId);
  }, []);

  const handleTaskAgentBecameAttention = useCallback((taskId: string) => {
    agentStatusHandlersRef.current?.onBecameAttention(taskId);
  }, []);

  const handleAgentTurnCompleted = useCallback(
    (event: AgentTurnCompletedEvent) => {
      void (async () => {
        try {
          await client.requestJson(
            `/api/v1/tasks/${encodeURIComponent(event.taskId)}/activities`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                type: "agent_worked",
                data: {
                  durationMs: event.durationMs,
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                  cacheReadTokens: event.cacheReadTokens,
                  cacheWriteTokens: event.cacheWriteTokens,
                  totalTokens: event.totalTokens,
                  chatId: event.chatId,
                  status: event.status,
                },
              }),
            },
          );
          setActivityFeedRevision((current) => current + 1);
        } catch {
          /* best-effort telemetry — don't interrupt the terminal UX */
        }
      })();

      const outcome = evaluateAgentTurnOutcome({
        reason: event.reason,
        status: event.status,
        assistantText: event.assistantText,
        abrupt: event.abrupt,
      });
      const replyParentCommentId =
        replyParentCommentByTaskRef.current.get(event.taskId) ?? null;
      // Consume once per turn — later manual prompts post top-level comments.
      replyParentCommentByTaskRef.current.delete(event.taskId);
      if (outcome.action === "hold") {
        // Optimistic list move; API write is inside the panel handler / fallback.
        if (agentStatusHandlersRef.current?.onNeedsHold) {
          agentStatusHandlersRef.current.onNeedsHold(
            event.taskId,
            outcome.decision,
            { parentCommentId: replyParentCommentId },
          );
        } else {
          void holdTaskForAgent(
            client,
            event.taskId,
            outcome.decision,
            { parentCommentId: replyParentCommentId },
          ).then((ok) => {
            if (ok) setActivityFeedRevision((current) => current + 1);
          });
        }
        return;
      }

      // Successful turn → In Review + comment (assistant text when we have it).
      // Wait for the API write before flipping the list — otherwise a failed
      // review leaves the board on In Review while Postgres stays elsewhere.
      void reviewTaskForAgent(
        client,
        event.taskId,
        event.assistantText,
        { parentCommentId: replyParentCommentId },
      ).then((ok) => {
        if (!ok) return;
        agentStatusHandlersRef.current?.onNeedsReview?.(event.taskId);
        setActivityFeedRevision((current) => current + 1);
      });
    },
    [client],
  );

  const handleInboxSelectedTaskMeta = useCallback(
    (
      task: { id: string; title: string; projectId: string | null } | null,
    ) => {
      setSelectedTaskMeta(task);
      if (task) {
        setSelectedTaskId((current) =>
          current === task.id ? current : task.id,
        );
        setTerminalEverOpened(true);
        writeFlag(TERMINAL_COLLAPSED_KEY, false);
        setTerminalCollapsed(false);
      }
    },
    [],
  );

  const invalidateActivityFeed = useCallback(() => {
    setActivityFeedRevision((current) => current + 1);
  }, []);

  const handleAttachAgentSession = useCallback(
    (request: AgentAttachRequest) => {
      // Always mount the terminal host so parked/background attaches are
      // processed — even when focusUi is false (Ready to Start from the list).
      setTerminalEverOpened(true);
      if (request.focusUi !== false) {
        writeFlag(TERMINAL_COLLAPSED_KEY, false);
        setTerminalCollapsed(false);
        // Inbox routes may still hold a display slug in selection state;
        // agent sessions are always keyed by task UUID.
        setSelectedTaskId((current) =>
          current === request.taskId ? current : request.taskId,
        );
      }
      const replyParent = request.replyParentCommentId?.trim() || null;
      if (replyParent) {
        replyParentCommentByTaskRef.current.set(request.taskId, replyParent);
      } else {
        // Non-hold attaches (manual prompt / ready-to-start) post top-level.
        replyParentCommentByTaskRef.current.delete(request.taskId);
      }
      setAgentAttachRequest(request);
      // Move to In Progress as soon as we hand the agent work — don't wait
      // for OSC/hooks (those can lag or miss on a fresh/parked session).
      if (request.prompt?.trim() || request.sessionIsNew) {
        // Optimistic list move; API write follows (idempotent if already there).
        agentStatusHandlersRef.current?.onBecameWorking?.(request.taskId);
        void markTaskInProgressForAgent(client, request.taskId).then((ok) => {
          if (ok) setActivityFeedRevision((current) => current + 1);
        });
      }
    },
    [client],
  );

  const handleAgentAttachRequestHandled = useCallback(() => {
    setAgentAttachRequest(null);
  }, []);

  const handleEndAgentSession = useCallback((request: AgentEndRequest) => {
    setAgentEndRequest(request);
  }, []);

  const handleAgentEndRequestHandled = useCallback(() => {
    setAgentEndRequest(null);
  }, []);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTaskMeta(null);
    }
  }, [selectedTaskId]);

  const selectedProject = selectedProjectId
    ? (projectsById.get(selectedProjectId) ?? null)
    : null;

  useEffect(() => {
    setSelectedCommit((current) => {
      if (!current) return null;
      const repository = selectedProject?.githubRepository ?? null;
      if (!repository || current.repository !== repository) return null;
      return current;
    });
  }, [selectedProject?.githubRepository, selectedProjectId]);

  const navigateAppTab = useCallback((href: string) => {
    const nextPath = href.startsWith("/") ? href : `/${href}`;
    skippingUrlSyncRef.current = true;
    window.history.pushState(window.history.state, "", nextPath);
    setLocationPath(nextPath);
    requestAnimationFrame(() => {
      skippingUrlSyncRef.current = false;
    });
  }, []);

  const appTabTitle = useMemo(
    () =>
      getConsoleTabTitle(locationPath, {
        projectName: selectedProject?.name,
        taskTitle:
          selectedTaskMeta && selectedTaskMeta.id === selectedTaskId
            ? selectedTaskMeta.title
            : null,
      }),
    [locationPath, selectedProject?.name, selectedTaskId, selectedTaskMeta],
  );

  const newAppTabHref = useMemo(
    () =>
      route.inbox
        ? "/inbox"
        : buildConsolePath({
            ...emptyConsoleRoute(),
            projectId: selectedProjectId,
            githubListTab,
          }),
    [githubListTab, route.inbox, selectedProjectId],
  );

  const newAppTabTitle = route.inbox
    ? "Inbox"
    : (selectedProject?.name ?? "Projects");

  const composeProjects = useMemo<ComposeModalProject[]>(
    () =>
      projectList.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        icon: project.icon ?? null,
        color: project.color ?? null,
        dueDate: project.dueDate ? new Date(project.dueDate) : null,
      })),
    [projectList],
  );

  const composePathname = route.inbox
    ? "/inbox"
    : selectedProject
      ? `/projects/${encodeURIComponent(selectedProject.key)}`
      : "/projects";

  const createComposeTask = useCallback(
    async (input: ComposeModalCreateTaskInput) => {
      if (!input.projectId) {
        throw new Error("Select a project for this task.");
      }
      if (!projectsById.has(input.projectId)) {
        throw new Error("That project is not available in Development.");
      }
      const created = await client.requestJson<ApiTask>("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: input.projectId,
          title: input.title,
          description: input.description || undefined,
          status: input.status,
          dueDate: input.dueDate,
          assigneeId: input.assigneeId,
        }),
      });
      refresh();
      return {
        href: buildConsolePath({
          ...emptyConsoleRoute(),
          projectId: input.projectId,
          taskId: created.id,
        }),
      };
    },
    [client, projectsById, refresh],
  );

  const contentStage: ContentStage = route.inbox
    ? selectedTaskId
      ? "task-focus"
      : "project"
    : !selectedProjectId
      ? "blank"
      : selectedTaskId
        ? "task-focus"
        : "project";

  const workspaceStage =
    contentStage === "task-focus" ? ("task" as const) : ("project" as const);

  const listOpen = route.inbox || Boolean(selectedProjectId);
  const overviewOpen =
    Boolean(selectedProject) && contentStage === "project" && !route.inbox;
  const sideDetailOpen =
    Boolean(selectedProject) && contentStage === "task-focus" && !route.inbox;
  /** Inbox keeps the attention list visible; detail sits in its own column. */
  const inboxDetailOpen = route.inbox && Boolean(selectedTaskId);

  const commitDetailOpen =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    Boolean(selectedCommit);
  const pullDetailOpen =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    Boolean(selectedPullRequest) &&
    !selectedCommit;
  const tasksListOpen =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    !terminalCollapsed &&
    !selectedCommit &&
    !selectedPullRequest;
  const inboxTerminalProjectId =
    route.inbox &&
    selectedTaskId &&
    selectedTaskMeta?.projectId &&
    projectsById.has(selectedTaskMeta.projectId)
      ? selectedTaskMeta.projectId
      : null;
  const terminalProjectId = selectedProject?.id ?? inboxTerminalProjectId;
  const terminalProject =
    terminalProjectId != null
      ? (projectsById.get(terminalProjectId) ?? null)
      : null;
  const workspaceCwd = normalizeWorkingDirectory(
    terminalProject?.localWorkingDirectory,
  );
  const terminalDirectoryReady = Boolean(workspaceCwd);

  // One-time migrate old localStorage cwd → API when the project has none.
  useEffect(() => {
    if (!terminalProject) return;
    if (normalizeWorkingDirectory(terminalProject.localWorkingDirectory)) {
      return;
    }
    const legacy = peekLegacyLocalDirectory(terminalProject.id);
    if (!legacy) return;
    const projectId = terminalProject.id;
    void saveProjectWorkingDirectory(projectId, legacy)
      .then(() => {
        clearLegacyLocalDirectory(projectId);
      })
      .catch(() => undefined);
  }, [
    saveProjectWorkingDirectory,
    terminalProject?.id,
    terminalProject?.localWorkingDirectory,
  ]);

  /**
   * Terminal buckets / agent attach are keyed by task UUID. Inbox URLs often
   * use a display slug in `selectedTaskId`, so prefer resolved meta id there.
   */
  const terminalTaskId = route.inbox
    ? (selectedTaskMeta?.id ?? null)
    : selectedTaskId;
  const terminalOpen =
    Boolean(terminalProjectId) &&
    Boolean(terminalTaskId) &&
    terminalEverOpened &&
    ((route.inbox && Boolean(selectedTaskId)) ||
      (!route.inbox && contentStage === "task-focus")) &&
    !terminalCollapsed;

  // Inbox main column is the terminal — only open it when the task has a
  // codebase project (same gate as terminalOpen's project id).
  const mainOpen = route.inbox
    ? Boolean(terminalTaskId) &&
      !terminalCollapsed &&
      Boolean(inboxTerminalProjectId)
    : Boolean(selectedProjectId) && !terminalCollapsed;

  const listPresence = useStagePresence(listOpen);
  const mainPresence = useStagePresence(mainOpen);
  const overviewPresence = useStagePresence(overviewOpen);
  const sideDetailPresence = useStagePresence(sideDetailOpen);
  const inboxDetailPresence = useStagePresence(inboxDetailOpen);
  const tasksListPresence = useStagePresence(tasksListOpen);
  const commitDetailPresence = useStagePresence(commitDetailOpen);
  const pullDetailPresence = useStagePresence(pullDetailOpen);
  const terminalPresence = useStagePresence(terminalOpen);

  const listResizeEnabled =
    listPresence.mounted &&
    !tasksCollapsed &&
    Boolean(mainOpen || inboxDetailOpen);

  const {
    width: listPanelWidth,
    isResizing: listResizing,
    frameRef: contentFrameRef,
    frameStyle: contentFrameStyle,
    onResizePointerDown,
  } = useConsoleListPanelWidth(listResizeEnabled);

  const [sideSlotEl, setSideSlotEl] = useState<HTMLDivElement | null>(null);
  const [mainSlotEl, setMainSlotEl] = useState<HTMLDivElement | null>(null);

  // Keep TerminalWorkspace mounted after first open so parked PTYs survive exits.
  const mountTerminal = terminalEverOpened || terminalPresence.mounted;

  const shellClass = [
    "console-shell",
    terminalCollapsed ? "console-shell--terminal-collapsed" : null,
    projectsCollapsed ? "console-shell--projects-collapsed" : null,
    tasksCollapsed ? "console-shell--tasks-collapsed" : null,
    route.inbox ? null : `console-shell--stage-${contentStage}`,
  ]
    .filter(Boolean)
    .join(" ");

  const contentFrameClass = route.inbox
    ? [
        "console-content-frame",
        selectedTaskId
          ? "console-content-frame--inbox-task"
          : "console-content-frame--inbox",
        terminalCollapsed || !selectedTaskId || !inboxTerminalProjectId
          ? "console-content-frame--main-collapsed"
          : null,
        listResizing ? "is-list-resizing" : null,
      ]
        .filter(Boolean)
        .join(" ")
    : [
        "console-content-frame",
        `console-content-frame--${contentStage}`,
        terminalCollapsed ? "console-content-frame--main-collapsed" : null,
        listResizing ? "is-list-resizing" : null,
      ]
        .filter(Boolean)
        .join(" ");

  return (
    <CommandPaletteProvider>
      <ConsoleSettingsShortcut
        enabled={!composeOpen && !route.settings}
        onNavigate={openSettingsFromShortcut}
      />
      <ConsoleTaskPropertyShortcuts enabled={!route.settings} />
      <ConsoleComposeShortcut
        enabled={!composeOpen && !route.settings}
        onCompose={() => setComposeOpen(true)}
      />
      <ListKeyboardNavigationProvider pathname="/projects">
        <ConsoleGithubListTabShortcut
          enabled={
            !composeOpen &&
            !route.settings &&
            !route.inbox &&
            Boolean(selectedProjectId) &&
            !selectedTaskId
          }
          onSelectTab={selectGithubListTab}
        />
        <AppTabsProvider
          pathname={locationPath}
          tabTitle={appTabTitle}
          newTabHref={newAppTabHref}
          newTabTitle={newAppTabTitle}
          navigate={navigateAppTab}
        >
          <div className="console-root">
            <ConsoleEscapeBackNavigation
              inboxActive={route.inbox}
              selectedProjectId={selectedProjectId}
              selectedTaskId={selectedTaskId}
              selectedCommitSha={selectedCommit?.commit.sha ?? null}
              selectedPullNumber={
                selectedPullRequest?.pullRequest.number ?? null
              }
              onClearCommit={clearSelectedCommit}
              onClearPullRequest={clearSelectedPullRequest}
              onClearInboxTask={() => navigateConsolePath("/inbox")}
            />
            <div className={shellClass}>
              {route.settings ? (
                <>
                  <div className="console-shell-nav console-shell-nav--settings">
                    <SettingsSidePanelNavView
                      pathname={locationPath}
                      Link={SettingsNavLink}
                      tabs={DEVELOPMENT_SETTINGS_NAV_TABS}
                      onBack={closeSettings}
                    />
                  </div>
                  <section
                    className="workspace console-workspace--settings"
                    aria-label="Settings"
                  >
                    <ConsoleSettingsPage tab={route.settingsTab} />
                  </section>
                </>
              ) : (
                <>
              <div className="console-shell-nav">
                <ProjectSidebar
                  projects={projectList}
                  selectedProjectId={selectedProjectId}
                  inboxActive={route.inbox}
                  loading={loading}
                  error={error}
                  collapsed={projectsCollapsed}
                  workingProjectIds={workingProjectIds}
                  onToggleCollapsed={toggleProjectsCollapsed}
                  onCompose={() => setComposeOpen(true)}
                  onSelect={selectProject}
                  onSelectInbox={selectInbox}
                  onOpenAppSettings={openAppSettings}
                  onRetry={reload}
                />
              </div>
              <section className="workspace">
                <ConsoleAppTabs />
                <div
                  ref={contentFrameRef}
                  className={contentFrameClass}
                  style={contentFrameStyle}
                >
                  {route.inbox ? (
                    <AttentionInboxProvider
                      projectsById={projectsById}
                      projectsReady={!loading}
                      pathname={locationPath}
                      onSelectedTaskMeta={handleInboxSelectedTaskMeta}
                      onActivityFeedInvalidate={invalidateActivityFeed}
                      agentStatusHandlersRef={agentStatusHandlersRef}
                    >
                      {listPresence.mounted && !tasksCollapsed ? (
                        <div
                          className={`console-content-list${
                            listPresence.shown ? " is-shown" : ""
                          }${terminalCollapsed ? " is-expanded" : ""}`}
                        >
                          <InboxAttentionList
                            pathname={locationPath}
                            Link={InboxPanelLink}
                            onNavigate={navigateConsolePath}
                            workingTaskIds={workingTaskIds}
                          />
                          {listResizeEnabled ? (
                            <div
                              className="console-list-resize-handle"
                              role="separator"
                              aria-orientation="vertical"
                              aria-label="Resize side panel"
                              aria-valuemin={CONSOLE_LIST_PANEL_MIN_WIDTH}
                              aria-valuemax={CONSOLE_LIST_PANEL_MAX_WIDTH}
                              aria-valuenow={listPanelWidth}
                              onPointerDown={onResizePointerDown}
                            />
                          ) : null}
                        </div>
                      ) : null}
                      {inboxDetailPresence.mounted ? (
                        <div
                          className={`console-content-inbox-detail${
                            inboxDetailPresence.shown ? " is-shown" : ""
                          }`}
                          aria-hidden={!inboxDetailPresence.shown}
                        >
                          <InboxAttentionDetail
                            pathname={locationPath}
                            projectsById={projectsById}
                            feedRevision={activityFeedRevision}
                            workingTaskIds={workingTaskIds}
                            agentOpenTaskIds={agentOpenTaskIds}
                            terminalCollapsed={terminalCollapsed}
                            onToggleTerminal={toggleTerminalCollapsed}
                            onAttachAgentSession={handleAttachAgentSession}
                            onEndAgentSession={handleEndAgentSession}
                            onActivityFeedInvalidate={invalidateActivityFeed}
                            onNavigate={navigateConsolePath}
                          />
                        </div>
                      ) : null}
                      {mainPresence.mounted ? (
                        <div
                          className={`console-content-main${
                            mainPresence.shown ? " is-shown" : ""
                          }`}
                          aria-hidden={!mainPresence.shown}
                        >
                          {mountTerminal && terminalProjectId ? (
                            <div
                              className={`console-content-main-terminal${
                                terminalPresence.shown ? " is-shown" : ""
                              }`}
                              aria-hidden={!terminalPresence.shown}
                            >
                              {terminalDirectoryReady ? (
                                <TerminalWorkspace
                                  projectId={terminalProjectId}
                                  projectLabel={
                                    terminalProject?.name ?? "Project"
                                  }
                                  taskId={terminalTaskId}
                                  onActiveTabIdChange={setActiveSessionTabId}
                                  onAgentActivitySummaryChange={setAgentSummary}
                                  onWorkingTaskIdsChange={
                                    handleWorkingTaskIdsChange
                                  }
                                  onWorkingProjectIdsChange={
                                    handleWorkingProjectIdsChange
                                  }
                                  onTaskAgentBecameWorking={
                                    handleTaskAgentBecameWorking
                                  }
                                  onTaskAgentBecameIdle={
                                    handleTaskAgentBecameIdle
                                  }
                                  onTaskAgentBecameAttention={
                                    handleTaskAgentBecameAttention
                                  }
                                  onAgentTurnCompleted={
                                    handleAgentTurnCompleted
                                  }
                                  agentAttachRequest={agentAttachRequest}
                                  onAgentAttachRequestHandled={
                                    handleAgentAttachRequestHandled
                                  }
                                  agentEndRequest={agentEndRequest}
                                  onAgentEndRequestHandled={
                                    handleAgentEndRequestHandled
                                  }
                                  onAgentOpenTaskIdsChange={
                                    handleAgentOpenTaskIdsChange
                                  }
                                  cwd={workspaceCwd}
                                  collapsed={
                                    terminalCollapsed || !terminalTaskId
                                  }
                                  layoutReady={
                                    terminalPresence.shown &&
                                    !terminalCollapsed &&
                                    Boolean(terminalTaskId)
                                  }
                                />
                              ) : (
                                <TerminalDirectoryGate
                                  onSelectDirectory={async (directory) => {
                                    await saveProjectWorkingDirectory(
                                      terminalProjectId,
                                      directory,
                                    );
                                  }}
                                />
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </AttentionInboxProvider>
                  ) : (
                    <>
                  {listPresence.mounted && !tasksCollapsed ? (
                    <div
                      className={`console-content-list${
                        listPresence.shown ? " is-shown" : ""
                      }${terminalCollapsed ? " is-expanded" : ""}`}
                    >
                      {selectedProject ? (
                        <div className="console-side-layers">
                          <div
                            className={`console-side-layer console-side-layer--overview${
                              overviewPresence.shown ? " is-shown" : ""
                            }`}
                            aria-hidden={!overviewPresence.shown}
                          >
                            {overviewPresence.mounted ? (
                              <div className="console-pane console-pane--overview">
                                <ProjectOverviewPane
                                  project={selectedProject}
                                  projects={projectList}
                                  onProjectUpdated={onProjectUpdated}
                                  githubListTab={githubListTab}
                                  onGithubListTabChange={selectGithubListTab}
                                  selectedCommitSha={
                                    selectedCommit?.commit.sha ?? null
                                  }
                                  onSelectCommit={selectCommit}
                                  selectedPullNumber={
                                    selectedPullRequest?.pullRequest.number ??
                                    null
                                  }
                                  onSelectPullRequest={selectPullRequest}
                                  tasksPanelCollapsed={terminalCollapsed}
                                  onToggleTasksPanel={toggleTerminalCollapsed}
                                />
                              </div>
                            ) : null}
                          </div>
                          <div
                            className={`console-side-layer console-side-layer--detail${
                              sideDetailPresence.shown ? " is-shown" : ""
                            }`}
                            aria-hidden={!sideDetailPresence.shown}
                            ref={setSideSlotEl}
                          />
                        </div>
                      ) : null}
                      {listResizeEnabled ? (
                        <div
                          className="console-list-resize-handle"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize side panel"
                          aria-valuemin={CONSOLE_LIST_PANEL_MIN_WIDTH}
                          aria-valuemax={CONSOLE_LIST_PANEL_MAX_WIDTH}
                          aria-valuenow={listPanelWidth}
                          onPointerDown={onResizePointerDown}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {mainPresence.mounted ? (
                    <div
                      className={`console-content-main${
                        mainPresence.shown ? " is-shown" : ""
                      }`}
                      aria-hidden={!mainPresence.shown}
                    >
                      {selectedProject ? (
                        <>
                          <div
                            className={`console-content-main-tasks${
                              tasksListPresence.shown ? " is-shown" : ""
                            }`}
                            aria-hidden={!tasksListPresence.shown}
                            ref={setMainSlotEl}
                          />
                          {commitDetailPresence.mounted && selectedCommit ? (
                            <div
                              className={`console-content-main-commit${
                                commitDetailPresence.shown ? " is-shown" : ""
                              }`}
                              aria-hidden={!commitDetailPresence.shown}
                            >
                              <CommitDetailPane
                                projectId={selectedProject.id}
                                commit={selectedCommit.commit}
                                repository={selectedCommit.repository}
                                parentPullRequest={
                                  selectedPullRequest?.pullRequest ?? null
                                }
                                onClose={clearSelectedCommit}
                                onNavigateToPull={navigateToParentPull}
                              />
                            </div>
                          ) : null}
                          {pullDetailPresence.mounted && selectedPullRequest ? (
                            <div
                              className={`console-content-main-commit${
                                pullDetailPresence.shown ? " is-shown" : ""
                              }`}
                              aria-hidden={!pullDetailPresence.shown}
                            >
                              <PullRequestDetailPane
                                projectId={selectedProject.id}
                                pullRequest={selectedPullRequest.pullRequest}
                                repository={selectedPullRequest.repository}
                                tab={pullDetailTab}
                                onTabChange={selectPullDetailTab}
                                onClose={clearSelectedPullRequest}
                                onSelectCommit={(commit, repository) => {
                                  selectCommit(commit, repository, {
                                    fromPullRequest:
                                      selectedPullRequest.pullRequest,
                                  });
                                }}
                              />
                            </div>
                          ) : null}
                          {mountTerminal ? (
                            <div
                              className={`console-content-main-terminal${
                                terminalPresence.shown ? " is-shown" : ""
                              }`}
                              aria-hidden={!terminalPresence.shown}
                            >
                              {terminalDirectoryReady ? (
                                <TerminalWorkspace
                                  projectId={selectedProject.id}
                                  projectLabel={selectedProject.name}
                                  taskId={terminalTaskId}
                                  onActiveTabIdChange={setActiveSessionTabId}
                                  onAgentActivitySummaryChange={setAgentSummary}
                                  onWorkingTaskIdsChange={
                                    handleWorkingTaskIdsChange
                                  }
                                  onWorkingProjectIdsChange={
                                    handleWorkingProjectIdsChange
                                  }
                                  onTaskAgentBecameWorking={
                                    handleTaskAgentBecameWorking
                                  }
                                  onTaskAgentBecameIdle={
                                    handleTaskAgentBecameIdle
                                  }
                                  onTaskAgentBecameAttention={
                                    handleTaskAgentBecameAttention
                                  }
                                  onAgentTurnCompleted={
                                    handleAgentTurnCompleted
                                  }
                                  agentAttachRequest={agentAttachRequest}
                                  onAgentAttachRequestHandled={
                                    handleAgentAttachRequestHandled
                                  }
                                  agentEndRequest={agentEndRequest}
                                  onAgentEndRequestHandled={
                                    handleAgentEndRequestHandled
                                  }
                                  onAgentOpenTaskIdsChange={
                                    handleAgentOpenTaskIdsChange
                                  }
                                  cwd={workspaceCwd}
                                  collapsed={
                                    terminalCollapsed || !terminalTaskId
                                  }
                                  layoutReady={
                                    terminalPresence.shown &&
                                    !terminalCollapsed &&
                                    Boolean(terminalTaskId)
                                  }
                                />
                              ) : (
                                <TerminalDirectoryGate
                                  onSelectDirectory={async (directory) => {
                                    await saveProjectWorkingDirectory(
                                      selectedProject.id,
                                      directory,
                                    );
                                  }}
                                />
                              )}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                    </>
                  )}
                </div>
                {selectedProject && !route.inbox ? (
                  <TaskSidebar
                    project={selectedProject}
                    projectsById={projectsById}
                    selectedTaskId={selectedTaskId}
                    onSelectedTaskIdChange={selectTaskId}
                    workspaceStage={workspaceStage}
                    sideTarget={sideSlotEl}
                    mainTarget={mainSlotEl}
                    terminalCollapsed={terminalCollapsed}
                    onToggleTerminal={toggleTerminalCollapsed}
                    onSelectedTaskChange={setSelectedTaskMeta}
                    workingTaskIds={workingTaskIds}
                    agentOpenTaskIds={agentOpenTaskIds}
                    activityFeedRevision={activityFeedRevision}
                    onActivityFeedInvalidate={invalidateActivityFeed}
                    agentStatusHandlersRef={agentStatusHandlersRef}
                    onAttachAgentSession={handleAttachAgentSession}
                    onEndAgentSession={handleEndAgentSession}
                  />
                ) : null}
              </section>
                </>
              )}
            </div>
            <footer className="console-statusbar" aria-label="Status">
              <div className="console-statusbar-right">
                <StatusBarMetrics
                  diskPath={workspaceCwd}
                  leading={<StatusBarAgents summary={agentSummary} />}
                />
              </div>
            </footer>
          </div>
          <ComposeModal
            open={composeOpen}
            onOpenChange={setComposeOpen}
            pathname={composePathname}
            projects={composeProjects}
            contacts={[]}
            defaultAssigneeId={null}
            documentFoldersByTarget={{}}
            allowedKinds={["task"]}
            requireProject
            onCreateTask={createComposeTask}
            onNavigate={(href) => {
              skippingUrlSyncRef.current = true;
              window.history.pushState(window.history.state, "", href);
              setLocationPath(href);
              requestAnimationFrame(() => {
                skippingUrlSyncRef.current = false;
              });
            }}
          />
        </AppTabsProvider>
      </ListKeyboardNavigationProvider>
    </CommandPaletteProvider>
  );
}
