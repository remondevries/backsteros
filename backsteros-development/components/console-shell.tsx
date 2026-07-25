"use client";

import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  Contact as ApiContact,
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
  applyOptimisticProjectReorder,
  getDefaultSettingsHref,
  isBlockingModalOpen,
  isTargetInsideBlockingModal,
  projectReorderPatches,
  shouldHandleGlobalShortcut,
  useCommandPalette,
  useEscapeBackNavigation,
  useListKeyboardNavigationZone,
  useNavigationShortcuts,
  useSettingsShortcut,
  useTaskPropertyDropdownShortcuts,
  ProjectOcticon,
  type ComposeModalCreateTaskInput,
  type ComposeModalProject,
  type InboxListItemLinkComponent,
  type ProjectReorderRequest,
  type SettingsSidePanelLinkComponent,
} from "@backsteros/ui";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { AppTabsProvider } from "@/components/app-tabs-provider";
import { CommitDetailPane } from "@/components/commit-detail-pane";
import { ConsoleCommandPalette } from "@/components/console-command-palette";
import {
  ConsoleProjectBreadcrumbHeader,
  type ConsoleBreadcrumbCrumb,
} from "@/components/console-project-breadcrumb-header";
import {
  ConsoleRunApplicationButton,
  type RunApplicationPanelApi,
} from "@/components/console-run-application-button";
import { FileDetailPane } from "@/components/file-detail-pane";
import { PullRequestDetailPane } from "@/components/pull-request-detail-pane";
import { ConsoleAppTabs } from "@/components/console-app-tabs";
import {
  AttentionInboxProvider,
  InboxAttentionDetail,
  InboxAttentionList,
  InboxChromeBreadcrumb,
} from "@/components/inbox-attention-pane";
import { ProjectOverviewPane } from "@/components/project-overview-pane";
import {
  getFirstConsoleProjectId,
  ProjectSidebar,
} from "@/components/project-sidebar";
import { ConsoleSettingsPage } from "@/components/settings-page";
import { StatusBarAgents } from "@/components/status-bar-agents";
import { StatusBarApps } from "@/components/status-bar-apps";
import { StatusBarMetrics } from "@/components/status-bar-metrics";
import { TaskSidebar } from "@/components/task-sidebar";
import { TerminalWorkspace } from "@/components/terminal-workspace";
import {
  CONSOLE_LIST_PANEL_MAX_WIDTH,
  CONSOLE_LIST_PANEL_MIN_WIDTH,
  useConsoleListPanelWidth,
} from "@/lib/console-list-panel-width";
import { useApiResource, useConsoleApi } from "@/lib/api-context";
import { useConsoleAvatarSrcMap, withAvatarSrc } from "@/lib/avatar-src";
import {
  getDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "@/lib/default-assignee";
import {
  emptyAgentActivitySummary,
  type AgentActivitySummary,
  type StatusBarAgentItem,
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
import {
  getCachedCommits,
  getCachedPullRequests,
  getCachedSelectedBranch,
} from "@/lib/github-project-cache";
import { CONSOLE_GO_NAVIGATION_ITEMS } from "@/lib/command-palette-search";
import { getConsoleTabTitle } from "@/lib/console-tab-title";
import { isFsTreeKeyboardActive } from "@/lib/fs-tree-create-shortcut";
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
/** Inbox browse ↔ focus column width slide. */
const INBOX_SLIDE_MS = 140;
/** Fade column content out/in around the inbox / project-list width slide. */
const INBOX_CONTENT_FADE_MS = 55;
/** Project list ⇧[ rail width slide (matches grid-template-columns transition). */
const PROJECT_LIST_SLIDE_MS = STAGE_MS;
/** Minimized attention list width while inbox focus (terminal expanded). */
const INBOX_FOCUS_LIST_WIDTH = 72;
/** Collapsed terminal rail width in inbox browse mode. */
const INBOX_TERMINAL_STRIP_WIDTH = 46;

/**
 * Concrete pixel widths for inbox columns. Flex-grow / width:auto cannot
 * interpolate in WebKit — transitioning these vars is what makes the slide.
 */
function computeInboxColumnWidths({
  columnsWidth,
  listPanelWidth,
  focusMode,
  showTerminal,
}: {
  columnsWidth: number;
  listPanelWidth: number;
  focusMode: boolean;
  showTerminal: boolean;
}): { list: number; detail: number; terminal: number } {
  const container = Math.max(0, Math.floor(columnsWidth));
  const preferredList = Math.min(
    Math.max(listPanelWidth, CONSOLE_LIST_PANEL_MIN_WIDTH),
    container,
  );

  if (!showTerminal) {
    const list = Math.min(preferredList, container);
    return { list, detail: Math.max(0, container - list), terminal: 0 };
  }

  if (focusMode) {
    const list = Math.min(INBOX_FOCUS_LIST_WIDTH, container);
    const detail = Math.min(preferredList, Math.max(0, container - list));
    const terminal = Math.max(0, container - list - detail);
    return { list, detail, terminal };
  }

  const terminal = Math.min(INBOX_TERMINAL_STRIP_WIDTH, container);
  const list = Math.min(preferredList, Math.max(0, container - terminal));
  const detail = Math.max(0, container - list - terminal);
  return { list, detail, terminal };
}

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

function githubCommitSubject(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  return line || "(no message)";
}

function pullDetailTabLabel(tab: GithubPullDetailTab): string {
  switch (tab) {
    case "conversation":
      return "Conversation";
    case "commits":
      return "Commits";
    case "files":
      return "Files";
  }
}

function basenamePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
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
  inboxFocusMode,
  selectedProjectId,
  selectedTaskId,
  selectedCommitSha,
  selectedPullNumber,
  selectedFilePath,
  onClearFile,
  onDisengagePullDetail,
  onExitInboxFocus,
  onFocusInboxTerminal,
  onClearInboxTask,
}: {
  inboxActive: boolean;
  inboxFocusMode?: boolean;
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  selectedCommitSha: string | null;
  selectedPullNumber: number | null;
  selectedFilePath: string | null;
  onClearFile: () => void;
  /** Escape from an open PR — return 1/2/3 to the list tabs. */
  onDisengagePullDetail?: () => void;
  onExitInboxFocus?: () => void;
  /** Refocus inbox terminal after Escape-blur (Tab). */
  onFocusInboxTerminal?: () => void;
  onClearInboxTask?: () => void;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();
  const { setActiveZone, clearHighlights } = useListKeyboardNavigationZone();

  // Treat project task lists / inbox as section homes (Escape should not leave them).
  const escapePathname =
    selectedTaskId && selectedProjectId
      ? `/${selectedProjectId}/${selectedTaskId}`
      : selectedTaskId && inboxActive
        ? `/inbox/${selectedTaskId}`
        : selectedFilePath && selectedProjectId
          ? `/${selectedProjectId}`
          : selectedCommitSha && selectedPullNumber && selectedProjectId
            ? `/${selectedProjectId}/pull/${selectedPullNumber}/commit/${selectedCommitSha}`
            : selectedCommitSha && selectedProjectId
              ? `/${selectedProjectId}/commit/${selectedCommitSha}`
              : selectedPullNumber && selectedProjectId
                ? `/${selectedProjectId}/pull/${selectedPullNumber}`
                : selectedProjectId
                  ? "/projects"
                  : "/inbox";

  const focusInboxList = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveZone("main", { activate: true });
      });
    });
  }, [setActiveZone]);

  const goBack = useCallback(() => {
    if (selectedFilePath) {
      const path = selectedFilePath;
      onClearFile();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActiveZone("content", {
            activate: true,
            highlightItemId: path,
          });
        });
      });
      return;
    }
    if (selectedCommitSha) {
      // Keep the open commit detail — Escape only returns j/k to the list.
      // The page stays until the user picks another commit / tab / PR.
      const sha = selectedCommitSha;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActiveZone("content", {
            activate: true,
            highlightItemId: sha,
          });
        });
      });
      return;
    }
    if (selectedPullNumber) {
      // Keep the open PR detail — Escape only returns j/k to the list and
      // hands 1–4 back to the side-panel tabs.
      const pullId = String(selectedPullNumber);
      onDisengagePullDetail?.();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActiveZone("content", {
            activate: true,
            highlightItemId: pullId,
          });
        });
      });
      return;
    }
    // Inbox focus (terminal already blurred) → browse: collapse terminal strip.
    if (inboxActive && inboxFocusMode && onExitInboxFocus) {
      onExitInboxFocus();
      focusInboxList();
      return;
    }
    if (inboxActive && selectedTaskId && onClearInboxTask) {
      onClearInboxTask();
      focusInboxList();
      return;
    }
    window.history.back();
  }, [
    focusInboxList,
    inboxActive,
    inboxFocusMode,
    onClearFile,
    onClearInboxTask,
    onDisengagePullDetail,
    onExitInboxFocus,
    selectedCommitSha,
    selectedFilePath,
    selectedPullNumber,
    selectedTaskId,
    setActiveZone,
  ]);

  // Inbox focus: Escape in terminal blurs only; Tab refocuses. Second Escape
  // (not in terminal) exits focus via useEscapeBackNavigation → goBack.
  // Register once via useLayoutEffect (before list-keyboard's useEffect) and keep
  // that listener first — re-binding when focus mode toggles would lose priority
  // and let Tab paint the orange inbox highlight again.
  const inboxActiveRef = useRef(inboxActive);
  inboxActiveRef.current = inboxActive;
  const inboxFocusModeForKeysRef = useRef(Boolean(inboxFocusMode));
  inboxFocusModeForKeysRef.current = Boolean(inboxFocusMode);
  const commandPaletteOpenRef = useRef(commandPaletteOpen);
  commandPaletteOpenRef.current = commandPaletteOpen;
  const clearHighlightsRef = useRef(clearHighlights);
  clearHighlightsRef.current = clearHighlights;
  const onFocusInboxTerminalRef = useRef(onFocusInboxTerminal);
  onFocusInboxTerminalRef.current = onFocusInboxTerminal;

  useLayoutEffect(() => {
    function isInTerminal(target: EventTarget | null): boolean {
      return (
        target instanceof HTMLElement &&
        Boolean(
          target.closest(".xterm") ||
            target.classList.contains("xterm-helper-textarea"),
        )
      );
    }

    function isEditableField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (isInTerminal(target)) return false;
        return true;
      }
      if (target.isContentEditable) return true;
      if (target.closest(".cm-editor") || target.closest("[role='textbox']")) {
        return true;
      }
      if (target.closest("[data-searchable-dropdown-panel]")) return true;
      return false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!inboxActiveRef.current || !inboxFocusModeForKeysRef.current) {
        return;
      }
      if (commandPaletteOpenRef.current) return;
      if (isBlockingModalOpen()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (
        event.key === "Escape" &&
        !event.shiftKey &&
        isInTerminal(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearHighlightsRef.current();
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
        return;
      }

      const focusTerminal = onFocusInboxTerminalRef.current;
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        focusTerminal &&
        !isInTerminal(event.target) &&
        !isEditableField(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        // Terminal owns focus — do not leave the orange inbox list highlight.
        clearHighlightsRef.current();
        focusTerminal();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Project task Escape is handled by TaskSidebar; inbox browse / exit-focus here.
  useEscapeBackNavigation({
    enabled:
      Boolean(selectedFilePath) ||
      !selectedTaskId ||
      (inboxActive && Boolean(selectedTaskId)),
    pathname: escapePathname,
    commandPaletteOpen,
    canGoBack: true,
    // Terminal Escape is handled above (blur); do not exit focus from xterm.
    allowFromTerminal: false,
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

/**
 * G → Go palette; G then letter → console destinations (same as web/desktop).
 * `/projects` focuses the left projects rail (no standalone projects page here).
 */
function ConsoleNavigationShortcuts({
  enabled,
  onNavigate,
}: {
  enabled: boolean;
  onNavigate: (href: string) => void;
}) {
  const { open, mode, openGo, setOpen } = useCommandPalette();
  useNavigationShortcuts({
    enabled,
    commandPaletteOpen: open,
    commandPaletteMode: mode,
    goItems: CONSOLE_GO_NAVIGATION_ITEMS,
    openGo,
    closePalette: () => setOpen(false),
    onNavigate,
  });
  return null;
}

/** Map product-style Go / palette hrefs onto console panels and focus zones. */
function ConsoleDestinationNavigate({
  enabled,
  inboxActive,
  inboxFocusMode,
  firstProjectId,
  onSelectInbox,
  onExitInboxFocus,
  onEnsureProjectsExpanded,
  onArmProjectsRail,
  navigatePath,
  locationPath,
  selectedProjectId,
  selectedProjectName,
  codebaseProjectIds,
}: {
  enabled: boolean;
  inboxActive: boolean;
  inboxFocusMode: boolean;
  /** First project in left-rail order — G then P highlights this row. */
  firstProjectId: string | null;
  onSelectInbox: () => void;
  onExitInboxFocus: () => void;
  onEnsureProjectsExpanded: () => void;
  /** Re-enable projects-rail j/k while a task has suspended it. */
  onArmProjectsRail: () => void;
  navigatePath: (href: string) => void;
  locationPath: string;
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  codebaseProjectIds: readonly string[];
}) {
  const { setActiveZone } = useListKeyboardNavigationZone();

  const onNavigate = useCallback(
    (href: string) => {
      const path =
        (href.split("?")[0] ?? href).replace(/\/+$/, "") || "/";

      if (path === "/inbox") {
        if (inboxActive && inboxFocusMode) {
          onExitInboxFocus();
        } else if (!inboxActive) {
          onSelectInbox();
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setActiveZone("main", { activate: true });
          });
        });
        return;
      }

      if (path === "/projects") {
        onEnsureProjectsExpanded();
        onArmProjectsRail();
        // After the Go palette closes, land keyboard highlight on the first
        // project (not Inbox / the currently selected project).
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setActiveZone("sidepanel", {
              preferSidepanelForJk: true,
              activate: true,
              highlightItemId: firstProjectId,
            });
          });
        });
        return;
      }

      navigatePath(href);
    },
    [
      firstProjectId,
      inboxActive,
      inboxFocusMode,
      navigatePath,
      onArmProjectsRail,
      onEnsureProjectsExpanded,
      onExitInboxFocus,
      onSelectInbox,
      setActiveZone,
    ],
  );

  return (
    <>
      <ConsoleNavigationShortcuts enabled={enabled} onNavigate={onNavigate} />
      <ConsoleCommandPalette
        locationPath={locationPath}
        selectedProjectId={selectedProjectId}
        selectedProjectName={selectedProjectName}
        codebaseProjectIds={codebaseProjectIds}
        onNavigate={onNavigate}
      />
    </>
  );
}

/** S / P / A / ⇧D (etc.) open property dropdowns on the focused task row. */
function ConsoleTaskPropertyShortcuts({
  enabled,
  pathname,
}: {
  enabled: boolean;
  pathname: string;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();
  useTaskPropertyDropdownShortcuts({
    enabled,
    commandPaletteOpen,
    pathname,
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

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;
      // Files tree owns C for new-file create while focused.
      if (isFsTreeKeyboardActive()) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const isC =
        (event.key.length === 1 && event.key.toLowerCase() === "c") ||
        event.code === "KeyC";
      if (!isC) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest(".cm-editor") ||
          target.closest("[role='textbox']")
        ) {
          return;
        }
      }

      event.preventDefault();
      event.stopPropagation();
      onCompose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, onCompose]);

  return null;
}

/**
 * Inbox focus navigation (browse ↔ terminal):
 * - ⌘⌥← / Ctrl+Alt+← — browse (wide list, terminal strip)
 * - ⌘⌥→ / Ctrl+Alt+→ — focus (narrow list, expanded terminal)
 * - ⌘← / ⌘→ from the terminal — same (⌥ often omitted; prevent history nav)
 * - ] — toggle focus mode on inbox (overrides the global terminal-collapse ])
 */
function ConsoleInboxFocusModeShortcut({
  enabled,
  inboxFocusMode,
  onExitFocus,
  onEnterFocus,
}: {
  enabled: boolean;
  inboxFocusMode: boolean;
  onExitFocus: () => void;
  onEnterFocus: () => void;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();
  const { setActiveZone } = useListKeyboardNavigationZone();
  const inboxFocusModeRef = useRef(inboxFocusMode);
  inboxFocusModeRef.current = inboxFocusMode;
  const onExitFocusRef = useRef(onExitFocus);
  onExitFocusRef.current = onExitFocus;
  const onEnterFocusRef = useRef(onEnterFocus);
  onEnterFocusRef.current = onEnterFocus;

  useEffect(() => {
    if (!enabled) return;

    function isHorizontalArrow(event: KeyboardEvent): "left" | "right" | null {
      if (
        event.key === "ArrowLeft" ||
        event.code === "ArrowLeft" ||
        event.keyCode === 37
      ) {
        return "left";
      }
      if (
        event.key === "ArrowRight" ||
        event.code === "ArrowRight" ||
        event.keyCode === 39
      ) {
        return "right";
      }
      return null;
    }

    function blurTerminalIfNeeded(target: EventTarget | null) {
      if (
        target instanceof HTMLElement &&
        (target.closest(".xterm") ||
          target.classList.contains("xterm-helper-textarea") ||
          target.tagName === "TEXTAREA")
      ) {
        target.blur();
      }
    }

    function exitToBrowse(target: EventTarget | null) {
      blurTerminalIfNeeded(target);
      onExitFocusRef.current();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActiveZone("main", { activate: true });
        });
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;
      if (
        isBlockingModalOpen() &&
        !isTargetInsideBlockingModal(event.target)
      ) {
        return;
      }

      const target = event.target;
      const inXterm =
        target instanceof HTMLElement &&
        Boolean(
          target.closest(".xterm") ||
            target.classList.contains("xterm-helper-textarea"),
        );

      // ] — toggle inbox focus (capture before the global panel listener).
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "]" || event.code === "BracketRight")
      ) {
        if (inXterm) {
          // ok
        } else if (!shouldHandleGlobalShortcut(event)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (inboxFocusModeRef.current) {
          exitToBrowse(target);
        } else {
          onEnterFocusRef.current();
        }
        return;
      }

      const primary = event.metaKey || event.ctrlKey;
      if (!primary || event.shiftKey) return;

      const direction = isHorizontalArrow(event);
      if (!direction) return;

      // Prefer ⌘⌥←/→; also accept ⌘←/→ while the terminal has focus so the
      // chord still works when ⌥ is omitted (and block history back/forward).
      if (!event.altKey && !inXterm) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (direction === "right") {
        onEnterFocusRef.current();
        return;
      }

      exitToBrowse(target);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, setActiveZone]);

  return null;
}

/**
 * Opening a project task should focus the terminal — not re-activate the
 * orange highlight on the projects rail (pathname sync would otherwise do that).
 */
function ConsoleProjectTaskTerminalFocus({
  enabled,
  taskId,
  onFocusTerminal,
}: {
  enabled: boolean;
  taskId: string | null;
  onFocusTerminal: () => void;
}) {
  const { clearHighlights } = useListKeyboardNavigationZone();
  const prevTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !taskId) {
      prevTaskIdRef.current = taskId;
      return;
    }
    if (prevTaskIdRef.current === taskId) return;
    prevTaskIdRef.current = taskId;

    // Drop list highlight so j/k cannot keep driving the projects rail while
    // the task list unmounts. Re-request terminal focus after layout settles
    // (selectTaskId also bumps focusRequest).
    clearHighlights();
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.closest("[data-keyboard-nav-item]") ||
        active.closest("[data-list-keyboard-nav-container]"))
    ) {
      active.blur();
    }
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onFocusTerminal();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [clearHighlights, enabled, onFocusTerminal, taskId]);

  return null;
}

/** 1 = Tasks, 2 = Files, 3 = Commits, 4 = PRs on the project overview list. */
function ConsoleGithubListTabShortcut({
  enabled,
  onSelectTab,
}: {
  enabled: boolean;
  onSelectTab: (tab: GithubListTab) => void;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();
  const { setActiveZone, clearHighlights } = useListKeyboardNavigationZone();

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
          ? "tasks"
          : event.key === "2"
            ? "files"
            : event.key === "3"
              ? "commits"
              : event.key === "4"
                ? "pulls"
                : null;
      if (!tab) return;

      event.preventDefault();
      event.stopPropagation();
      onSelectTab(tab);
      // Leave editors / project-rail focus so j/k land on the list tab.
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.closest(".cm-editor") ||
          active.closest("[data-keyboard-nav-item]") ||
          active.closest("[data-list-keyboard-nav-container]"))
      ) {
        active.blur();
      }
      clearHighlights();
      // Double rAF: wait for the tab body to register before activating.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActiveZone(tab === "tasks" ? "main" : "content", {
            activate: true,
          });
        });
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    clearHighlights,
    commandPaletteOpen,
    enabled,
    onSelectTab,
    setActiveZone,
  ]);

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
    displayId?: string | null;
    status?: string | null;
  } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<{
    commit: GithubCommit;
    repository: string;
  } | null>(null);
  const [selectedPullRequest, setSelectedPullRequest] = useState<{
    pullRequest: GithubPullRequest;
    repository: string;
  } | null>(null);
  /**
   * PR detail 1/2/3 (Conversation/Commits/Files) only after Enter/Space/click
   * into a PR. While browsing the PR list (including Escape back), 1–4 stay on
   * the left-side Tasks/Files/Commits/PRs tabs.
   */
  const [pullDetailHotkeysActive, setPullDetailHotkeysActive] = useState(false);
  const [openFilePaths, setOpenFilePaths] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileEditorFocusRequest, setFileEditorFocusRequest] = useState(0);
  const openFilePathsRef = useRef<string[]>([]);
  const activeFilePathRef = useRef<string | null>(null);
  const fileTabsByProjectRef = useRef(
    new Map<string, { openPaths: string[]; activePath: string | null }>(),
  );
  const fileTabsProjectIdRef = useRef<string | null>(null);
  openFilePathsRef.current = openFilePaths;
  activeFilePathRef.current = activeFilePath;
  const [githubListTab, setGithubListTab] = useState<GithubListTab>(
    () => route.githubListTab ?? "tasks",
  );
  /** Hold prior main content while Commits/PRs auto-select the first row. */
  const [githubDetailPending, setGithubDetailPending] = useState(false);
  const githubListTabRef = useRef(githubListTab);
  githubListTabRef.current = githubListTab;
  const selectedCommitRef = useRef(selectedCommit);
  selectedCommitRef.current = selectedCommit;
  const selectedPullRequestRef = useRef(selectedPullRequest);
  selectedPullRequestRef.current = selectedPullRequest;
  const [pullDetailTab, setPullDetailTab] = useState<GithubPullDetailTab>(
    () => route.pullTab ?? "conversation",
  );
  const [pullDetailFilePath, setPullDetailFilePath] = useState<string | null>(
    null,
  );
  // Layout stage is driven by selection. Deep links: task → split with
  // terminal; project only → overview + task list (main pane visible).
  const [terminalCollapsed, setTerminalCollapsed] = useState(
    () => Boolean(route.inbox),
  );
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const tasksCollapsedRef = useRef(tasksCollapsed);
  tasksCollapsedRef.current = tasksCollapsed;
  /**
   * Project list ⇧[ rail: keep chrome while width slides; fade inner content
   * so tab labels do not reflow mid-resize (same idea as inbox focus).
   */
  const [projectListContentVisible, setProjectListContentVisible] =
    useState(true);
  const projectListContentVisibleRef = useRef(projectListContentVisible);
  projectListContentVisibleRef.current = projectListContentVisible;
  const projectListLayoutTimersRef = useRef<ReturnType<typeof setTimeout>[]>(
    [],
  );
  /** Inbox Enter focus: minimized attention list + expanded terminal. */
  const [inboxFocusMode, setInboxFocusMode] = useState(false);
  /**
   * Browse-mode terminal strip (collapsed rail). Revealed after the exit
   * width slide so `display: none` does not cut the animation short.
   */
  const [inboxTerminalStripVisible, setInboxTerminalStripVisible] =
    useState(true);
  /**
   * Column chrome stays visible during the width slide; inner content is
   * hidden so text does not reflow mid-resize (fade out → slide → fade in).
   */
  const [inboxContentVisible, setInboxContentVisible] = useState(true);
  const inboxFocusModeRef = useRef(inboxFocusMode);
  inboxFocusModeRef.current = inboxFocusMode;
  const inboxContentVisibleRef = useRef(inboxContentVisible);
  inboxContentVisibleRef.current = inboxContentVisible;
  const inboxLayoutTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Pixel width of `.console-content-columns` for inbox slide vars. */
  const [inboxColumnsWidth, setInboxColumnsWidth] = useState(0);
  const inboxColumnsRef = useRef<HTMLDivElement | null>(null);
  /** Bump to focus the active xterm after opening the terminal column. */
  const [terminalFocusRequest, setTerminalFocusRequest] = useState(0);
  /** Keep TerminalWorkspace mounted after first task focus so parked PTYs live. */
  const [terminalEverOpened, setTerminalEverOpened] = useState(
    () => Boolean(route.taskId),
  );
  const [agentSummary, setAgentSummary] = useState<AgentActivitySummary>(
    emptyAgentActivitySummary,
  );
  const [agentStatusItems, setAgentStatusItems] = useState<StatusBarAgentItem[]>(
    [],
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
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(
    () => getDefaultAssigneeId(),
  );
  /** G then P can re-enable projects-rail j/k while a task suspends it. */
  const [projectsRailArmed, setProjectsRailArmed] = useState(false);
  const skippingUrlSyncRef = useRef(false);
  const runApplicationPanelApiRef = useRef<RunApplicationPanelApi | null>(
    null,
  );

  useEffect(() => {
    const projectsHidden = readFlag(PROJECTS_COLLAPSED_KEY);
    const tasksHidden = readFlag(TASKS_COLLAPSED_KEY);
    // Old Run Application "fullscreen" collapsed both rails and persisted that
    // to localStorage. That mode was removed, so unwind the orphaned layout.
    if (projectsHidden && tasksHidden) {
      writeFlag(PROJECTS_COLLAPSED_KEY, false);
      writeFlag(TASKS_COLLAPSED_KEY, false);
      setProjectsCollapsed(false);
      setTasksCollapsed(false);
      return;
    }
    setProjectsCollapsed(projectsHidden);
    setTasksCollapsed(tasksHidden);
  }, []);

  useEffect(() => {
    if (selectedTaskId) {
      setTerminalEverOpened(true);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    return () => {
      for (const timer of inboxLayoutTimersRef.current) {
        clearTimeout(timer);
      }
      inboxLayoutTimersRef.current = [];
      for (const timer of projectListLayoutTimersRef.current) {
        clearTimeout(timer);
      }
      projectListLayoutTimersRef.current = [];
    };
  }, []);

  const toggleProjectsCollapsed = useCallback(() => {
    setProjectsCollapsed((current) => {
      const next = !current;
      writeFlag(PROJECTS_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const ensureProjectsExpanded = useCallback(() => {
    setProjectsCollapsed((current) => {
      if (!current) return current;
      writeFlag(PROJECTS_COLLAPSED_KEY, false);
      return false;
    });
  }, []);

  const clearProjectListLayoutTimers = useCallback(() => {
    for (const timer of projectListLayoutTimersRef.current) {
      clearTimeout(timer);
    }
    projectListLayoutTimersRef.current = [];
  }, []);

  const scheduleProjectListLayout = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    projectListLayoutTimersRef.current.push(timer);
  }, []);

  /**
   * Project list expand/collapse: fade content out, slide rail width, fade in.
   * Avoids tab labels reflowing while the column interpolates.
   */
  const transitionTasksCollapsed = useCallback(
    (nextCollapsed: boolean) => {
      if (
        tasksCollapsedRef.current === nextCollapsed &&
        projectListContentVisibleRef.current
      ) {
        return;
      }

      clearProjectListLayoutTimers();
      const fadeOutMs = projectListContentVisibleRef.current
        ? INBOX_CONTENT_FADE_MS
        : 0;
      setProjectListContentVisible(false);
      projectListContentVisibleRef.current = false;

      scheduleProjectListLayout(() => {
        setTasksCollapsed(nextCollapsed);
        tasksCollapsedRef.current = nextCollapsed;
        writeFlag(TASKS_COLLAPSED_KEY, nextCollapsed);
        if (nextCollapsed) {
          setTerminalCollapsed((terminalHidden) => {
            if (terminalHidden) {
              writeFlag(TERMINAL_COLLAPSED_KEY, false);
              return false;
            }
            return terminalHidden;
          });
        }

        scheduleProjectListLayout(() => {
          setProjectListContentVisible(true);
          projectListContentVisibleRef.current = true;
        }, PROJECT_LIST_SLIDE_MS);
      }, fadeOutMs);
    },
    [clearProjectListLayoutTimers, scheduleProjectListLayout],
  );

  const toggleTasksCollapsed = useCallback(() => {
    transitionTasksCollapsed(!tasksCollapsedRef.current);
  }, [transitionTasksCollapsed]);

  const toggleTerminalCollapsed = useCallback(() => {
    setTerminalCollapsed((current) => {
      const next = !current;
      writeFlag(TERMINAL_COLLAPSED_KEY, next);
      if (next && tasksCollapsedRef.current) {
        transitionTasksCollapsed(false);
      }
      return next;
    });
  }, [transitionTasksCollapsed]);

  const showTaskTerminal = useCallback(() => {
    setTerminalEverOpened(true);
    writeFlag(TERMINAL_COLLAPSED_KEY, false);
    setTerminalCollapsed(false);
  }, []);

  const hideTaskTerminal = useCallback(() => {
    writeFlag(TERMINAL_COLLAPSED_KEY, true);
    setTerminalCollapsed(true);
  }, []);

  // Escape while the run/build terminal panel is open + running → shut down
  // (same as the Running button). Capture + stopImmediate so list/escape-back
  // handlers cannot swallow the key first.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (runApplicationPanelApiRef.current?.handleEscape()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
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

      // ⇧[ — toggle the content list side panel (overview / PRs / inbox list)
      if (
        event.shiftKey &&
        (event.key === "[" ||
          event.key === "{" ||
          event.code === "BracketLeft")
      ) {
        event.preventDefault();
        toggleTasksCollapsed();
        return;
      }

      // ] — toggle terminal (project task view). Inbox uses the same key via
      // ConsoleInboxFocusModeShortcut to toggle browse ↔ focus.
      if (
        !event.shiftKey &&
        (event.key === "]" || event.code === "BracketRight")
      ) {
        if (route.inbox) return;
        event.preventDefault();
        toggleTerminalCollapsed();
        return;
      }

      // ⇧T — right panel: task terminal when a task is open, otherwise run/build
      if (
        event.shiftKey &&
        (event.key === "T" || event.key === "t" || event.code === "KeyT")
      ) {
        if (!selectedProjectId || route.settings || route.inbox) {
          return;
        }
        event.preventDefault();
        if (selectedTaskId) {
          // Never leave the run/build drawer covering the task terminal.
          runApplicationPanelApiRef.current?.close();
          if (terminalCollapsed) {
            showTaskTerminal();
          } else {
            hideTaskTerminal();
          }
        } else {
          runApplicationPanelApiRef.current?.toggle();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [
    hideTaskTerminal,
    route.inbox,
    route.settings,
    selectedProjectId,
    selectedTaskId,
    showTaskTerminal,
    terminalCollapsed,
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

  const loadContacts = useCallback(
    async (api: BacksterosApiClient, signal: AbortSignal) => {
      const result = await api.requestJson<{ contacts: ApiContact[] }>(
        "/api/v1/contacts",
        { signal },
      );
      return result.contacts ?? [];
    },
    [],
  );
  const { data: contacts } = useApiResource(loadContacts, []);
  const contactAvatarSrc = useConsoleAvatarSrcMap("contact", contacts ?? []);

  useEffect(() => {
    let cancelled = false;
    void client
      .requestJson<{ settings: Record<string, unknown> }>("/api/v1/settings")
      .then((body) => {
        if (cancelled) return;
        setDefaultAssigneeId(
          syncDefaultAssigneeIdFromSettings(body.settings),
        );
      })
      .catch(() => {
        // keep local cache
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const projectList = projects ?? [];
  const firstProjectId = useMemo(
    () => getFirstConsoleProjectId(projectList),
    [projectList],
  );
  const projectsById = useMemo(() => {
    const map = new Map<string, ApiProject>();
    for (const project of projectList) map.set(project.id, project);
    return map;
  }, [projectList]);

  const codebaseProjectIds = useMemo(
    () => projectList.map((project) => project.id),
    [projectList],
  );

  const wasInboxRef = useRef(route.inbox);
  /** Prior URL detail — used so `/commits` list URLs do not wipe auto-select. */
  const previousRouteDetailRef = useRef<{
    commitSha: string | null;
    pullNumber: number | null;
  }>({
    commitSha: route.commitSha,
    pullNumber: route.pullNumber,
  });

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
      if (!wasInboxRef.current) {
        setInboxFocusMode(false);
        writeFlag(TERMINAL_COLLAPSED_KEY, true);
        setTerminalCollapsed(true);
      }
    } else {
      if (wasInboxRef.current) {
        setInboxFocusMode(false);
      }
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
        const leftDetail =
          previousRouteDetailRef.current.commitSha != null ||
          previousRouteDetailRef.current.pullNumber != null;
        // Commits/PRs list URLs omit the detail segment while auto-select runs.
        // Only clear when leaving a deep link (back) or leaving those tabs.
        if (
          leftDetail ||
          route.taskId ||
          (route.githubListTab !== "commits" &&
            route.githubListTab !== "pulls")
        ) {
          setSelectedCommit(null);
          setSelectedPullRequest(null);
          setPullDetailHotkeysActive(false);
        }
      }

      if (route.taskId) {
        setSelectedCommit(null);
        setSelectedPullRequest(null);
        setPullDetailHotkeysActive(false);
        writeFlag(TERMINAL_COLLAPSED_KEY, false);
        setTerminalCollapsed(false);
      }
    }
    previousRouteDetailRef.current = {
      commitSha: route.commitSha,
      pullNumber: route.pullNumber,
    };
    wasInboxRef.current = route.inbox;
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
      const alreadySelected =
        selectedPullRequestRef.current?.pullRequest.number === pullNumber;
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
      // Real deep link / in-app navigation to a new PR → engage detail hotkeys.
      // URL sync after list auto-select must NOT steal focus onto PR tabs —
      // keep 1–4 / j/k on the list (same as commits).
      if (!alreadySelected) {
        setPullDetailHotkeysActive(true);
      }
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
      setProjects((current) => {
        const rows = current ?? [];
        if (updated.type !== "codebase") {
          return rows.filter((entry) => entry.id !== updated.id);
        }
        const index = rows.findIndex((entry) => entry.id === updated.id);
        if (index === -1) {
          return [...rows, updated];
        }
        return rows.map((entry) =>
          entry.id === updated.id ? updated : entry,
        );
      });
    },
    [setProjects],
  );

  const handleProjectReorder = useCallback(
    (request: ProjectReorderRequest) => {
      const patches = projectReorderPatches(projectList, request);
      setProjects((current) =>
        applyOptimisticProjectReorder(current ?? [], request),
      );
      for (const patch of patches) {
        void client
          .requestJson<ApiProject>(
            `/api/v1/projects/${encodeURIComponent(patch.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: patch.status,
                sortOrder: patch.sortOrder,
              }),
            },
          )
          .then(onProjectUpdated)
          .catch(() => {
            /* optimistic list already updated; next reload heals */
          });
      }
    },
    [client, onProjectUpdated, projectList, setProjects],
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

  const patchSelectedProject = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      const updated = await client.requestJson<ApiProject>(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      onProjectUpdated(updated);
      return updated;
    },
    [client, onProjectUpdated, selectedProjectId],
  );

  const saveSelectedProjectName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false as const, error: "Project name is required." };
      }
      try {
        await patchSelectedProject({ name: trimmed });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "Failed to save name.",
        };
      }
    },
    [patchSelectedProject],
  );

  const selectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedTaskId(null);
    setActiveSessionTabId(null);
    setSelectedTaskMeta(null);
    setSelectedCommit(null);
    setSelectedPullRequest(null);
    setGithubListTab("tasks");
    setPullDetailTab("conversation");
    setInboxFocusMode(false);
    writeFlag(TERMINAL_COLLAPSED_KEY, false);
    setTerminalCollapsed(false);
  }, []);

  const selectInbox = useCallback(() => {
    // Already on inbox: do not clear the task / remount (Enter on projects
    // rail while Inbox is selected used to thrash /inbox ↔ /inbox/task).
    if (route.inbox) {
      return;
    }
    skippingUrlSyncRef.current = true;
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveSessionTabId(null);
    setSelectedTaskMeta(null);
    setSelectedCommit(null);
    setSelectedPullRequest(null);
    setGithubListTab("files");
    setPullDetailTab("conversation");
    setInboxFocusMode(false);
    writeFlag(TERMINAL_COLLAPSED_KEY, true);
    setTerminalCollapsed(true);
    window.history.pushState(window.history.state, "", "/inbox");
    setLocationPath("/inbox");
    requestAnimationFrame(() => {
      skippingUrlSyncRef.current = false;
    });
  }, [route.inbox]);

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
    setGithubDetailPending(false);
    if (selectedPullRequest) {
      setGithubListTab("pulls");
      setPullDetailTab("commits");
      // Back inside the parent PR — restore PR tab hotkeys.
      setPullDetailHotkeysActive(true);
    } else {
      setGithubListTab("commits");
    }
  }, [selectedPullRequest]);

  const navigateToParentPull = useCallback(() => {
    setSelectedCommit(null);
    setGithubDetailPending(false);
    setGithubListTab("pulls");
    setPullDetailTab("commits");
    setPullDetailHotkeysActive(true);
  }, []);

  const clearSelectedPullRequest = useCallback(() => {
    setSelectedPullRequest(null);
    setSelectedCommit(null);
    setGithubDetailPending(false);
    setPullDetailTab("conversation");
    setPullDetailFilePath(null);
    setGithubListTab("pulls");
    setPullDetailHotkeysActive(false);
  }, []);

  const disengagePullDetailHotkeys = useCallback(() => {
    setPullDetailHotkeysActive(false);
  }, []);

  const clearSelectedFile = useCallback(() => {
    // Hide the editor (task list returns) but keep open tabs for Files restore.
    setActiveFilePath(null);
    setGithubListTab("files");
  }, []);

  const selectFile = useCallback(
    (filePath: string, options?: { newTab?: boolean; focusEditor?: boolean }) => {
      setSelectedTaskId(null);
      setActiveSessionTabId(null);
      setSelectedTaskMeta(null);
      setSelectedCommit(null);
      setSelectedPullRequest(null);
      setPullDetailTab("conversation");
      setGithubListTab("files");

      const open = openFilePathsRef.current;
      const active = activeFilePathRef.current;

      if (open.includes(filePath)) {
        setActiveFilePath(filePath);
        if (options?.focusEditor) {
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            active.closest(".console-fs-tree")
          ) {
            active.blur();
          }
          setFileEditorFocusRequest((count) => count + 1);
        }
        return;
      }

      // First file, or no active tab → open as a new tab.
      // ⌘/Ctrl-click → always a new tab. Otherwise replace the active tab.
      const openInNewTab =
        Boolean(options?.newTab) || open.length === 0 || !active;

      if (openInNewTab) {
        setOpenFilePaths([...open, filePath]);
      } else {
        setOpenFilePaths(open.map((path) => (path === active ? filePath : path)));
      }
      setActiveFilePath(filePath);
      if (options?.focusEditor) {
        // Avoid a UA blue ring on the tree button while the editor mounts.
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.closest(".console-fs-tree")
        ) {
          active.blur();
        }
        setFileEditorFocusRequest((count) => count + 1);
      }
    },
    [],
  );

  const closeFileTab = useCallback((filePath: string) => {
    setOpenFilePaths((paths) => {
      const index = paths.indexOf(filePath);
      if (index < 0) return paths;
      const next = paths.filter((path) => path !== filePath);
      setActiveFilePath((current) => {
        if (current !== filePath) return current;
        if (next.length === 0) return null;
        return next[Math.min(index, next.length - 1)] ?? null;
      });
      return next;
    });
  }, []);
  const closeFileTabRef = useRef(closeFileTab);
  closeFileTabRef.current = closeFileTab;
  const requestCloseFileTabRef = useRef<((path: string) => void) | null>(null);
  const [fileTreeRefreshToken, setFileTreeRefreshToken] = useState(0);
  const handleFsEntryDeleted = useCallback((deletedPath: string) => {
    const prefix = deletedPath.endsWith("/") ? deletedPath : `${deletedPath}/`;
    setOpenFilePaths((paths) =>
      paths.filter((path) => path !== deletedPath && !path.startsWith(prefix)),
    );
    setActiveFilePath((current) => {
      if (!current) return current;
      if (current === deletedPath || current.startsWith(prefix)) {
        return null;
      }
      return current;
    });
    setFileTreeRefreshToken((token) => token + 1);
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
      setGithubDetailPending(false);
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
      setPullDetailHotkeysActive(false);
      setPullDetailFilePath(null);
      setSelectedCommit({ commit, repository });
    },
    [],
  );

  const selectPullRequest = useCallback(
    (
      pullRequest: GithubPullRequest,
      repository: string,
      options?: { engageHotkeys?: boolean },
    ) => {
      setSelectedTaskId(null);
      setActiveSessionTabId(null);
      setSelectedTaskMeta(null);
      setGithubDetailPending(false);
      setSelectedCommit(null);
      setGithubListTab("pulls");
      setPullDetailTab("conversation");
      setPullDetailFilePath(null);
      setSelectedPullRequest({ pullRequest, repository });
      // Enter/Space/click engage PR 1/2/3; auto-select stays on list tabs.
      setPullDetailHotkeysActive(options?.engageHotkeys !== false);
    },
    [],
  );

  const selectGithubListTab = useCallback(
    (tab: GithubListTab) => {
      const previousTab = githubListTabRef.current;
      setGithubListTab(tab);
      setPullDetailTab("conversation");

      if (tab === "files") {
        setGithubDetailPending(false);
        setSelectedCommit(null);
        setSelectedPullRequest(null);
        setPullDetailHotkeysActive(false);
        // Keep j/k on the file tree — don't replay a stale editor focus.
        setFileEditorFocusRequest(0);
        setActiveFilePath((current) => {
          if (current) return current;
          const open = openFilePathsRef.current;
          return open[open.length - 1] ?? null;
        });
        return;
      }

      if (tab === "tasks") {
        setGithubDetailPending(false);
        setSelectedCommit(null);
        setSelectedPullRequest(null);
        setPullDetailHotkeysActive(false);
        return;
      }

      // Already on this tab with a detail open — keep it (no blank flash).
      if (
        tab === "commits" &&
        previousTab === "commits" &&
        selectedCommitRef.current
      ) {
        setGithubDetailPending(false);
        return;
      }
      if (
        tab === "pulls" &&
        previousTab === "pulls" &&
        selectedPullRequestRef.current
      ) {
        setGithubDetailPending(false);
        return;
      }

      const project =
        selectedProjectId != null
          ? projectsById.get(selectedProjectId)
          : undefined;
      const repo = project?.githubRepository ?? null;

      if (tab === "commits") {
        if (repo && selectedProjectId) {
          const branch = getCachedSelectedBranch(selectedProjectId, repo);
          const first = getCachedCommits(
            selectedProjectId,
            repo,
            branch ?? null,
          )?.commits[0];
          if (first) {
            setSelectedTaskId(null);
            setActiveSessionTabId(null);
            setSelectedTaskMeta(null);
            setSelectedPullRequest(null);
            setPullDetailHotkeysActive(false);
            setPullDetailFilePath(null);
            setSelectedCommit({ commit: first, repository: repo });
            setGithubDetailPending(false);
            return;
          }
        }
        // Keep current main content visible until auto-select fills in.
        setGithubDetailPending(true);
        return;
      }

      if (tab === "pulls") {
        if (repo && selectedProjectId) {
          const first = getCachedPullRequests(selectedProjectId, repo)
            ?.pullRequests[0];
          if (first) {
            setSelectedTaskId(null);
            setActiveSessionTabId(null);
            setSelectedTaskMeta(null);
            setSelectedCommit(null);
            setPullDetailFilePath(null);
            setSelectedPullRequest({ pullRequest: first, repository: repo });
            // Tab switch auto-open — keep 1–4 on the list tabs until Enter.
            setPullDetailHotkeysActive(false);
            setGithubDetailPending(false);
            return;
          }
        }
        setGithubDetailPending(true);
      }
    },
    [projectsById, selectedProjectId],
  );

  const selectPullDetailTab = useCallback((tab: GithubPullDetailTab) => {
    setPullDetailTab(tab);
    setPullDetailHotkeysActive(true);
    if (tab !== "files") {
      setPullDetailFilePath(null);
    }
  }, []);

  const selectTaskId = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
    if (taskId) {
      setProjectsRailArmed(false);
      setSelectedCommit(null);
      setSelectedPullRequest(null);
      setPullDetailHotkeysActive(false);
      setPullDetailTab("conversation");
      writeFlag(TERMINAL_COLLAPSED_KEY, false);
      setTerminalCollapsed(false);
      setTerminalEverOpened(true);
      // Run/build drawer is for project scope — don't leave it over the terminal.
      runApplicationPanelApiRef.current?.close();
      // Focus the task PTY once layout/session catch up (see TerminalWorkspace).
      setTerminalFocusRequest((count) => count + 1);
    } else {
      setActiveSessionTabId(null);
      setSelectedTaskMeta(null);
    }
  }, []);

  const armProjectsRail = useCallback(() => {
    setProjectsRailArmed(true);
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

  const handleAgentStatusItemsChange = useCallback(
    (items: StatusBarAgentItem[]) => {
      setAgentStatusItems(items);
    },
    [],
  );

  const navigateToAgentItem = useCallback(
    (item: StatusBarAgentItem) => {
      if (item.projectId) {
        setSelectedProjectId(item.projectId);
      }
      selectTaskId(item.taskId);
    },
    [selectTaskId],
  );

  const navigateToAppSession = useCallback(
    (session: { projectId: string }) => {
      selectProject(session.projectId);
    },
    [selectProject],
  );

  const statusBarProjectNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const [id, project] of projectsById) {
      names[id] = project.name;
    }
    return names;
  }, [projectsById]);

  const statusBarProjectKeys = useMemo(() => {
    const keys: Record<string, string> = {};
    for (const [id, project] of projectsById) {
      keys[id] = project.key;
    }
    return keys;
  }, [projectsById]);

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

  const clearInboxLayoutTimers = useCallback(() => {
    for (const timer of inboxLayoutTimersRef.current) {
      clearTimeout(timer);
    }
    inboxLayoutTimersRef.current = [];
  }, []);

  const scheduleInboxLayout = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    inboxLayoutTimersRef.current.push(timer);
  }, []);

  /**
   * Inbox browse ↔ focus: fade content out, slide column widths, fade in.
   * Keeps text from reflowing while columns interpolate.
   */
  const transitionInboxFocusMode = useCallback(
    (nextFocus: boolean) => {
      if (
        inboxFocusModeRef.current === nextFocus &&
        inboxContentVisibleRef.current
      ) {
        return;
      }

      clearInboxLayoutTimers();
      const fadeOutMs = inboxContentVisibleRef.current
        ? INBOX_CONTENT_FADE_MS
        : 0;
      setInboxContentVisible(false);
      inboxContentVisibleRef.current = false;

      scheduleInboxLayout(() => {
        setInboxFocusMode(nextFocus);
        inboxFocusModeRef.current = nextFocus;

        if (nextFocus) {
          setInboxTerminalStripVisible(false);
          setTerminalEverOpened(true);
          writeFlag(TERMINAL_COLLAPSED_KEY, false);
          setTerminalCollapsed(false);
        } else {
          // Keep strip off until widths finish so the column can slide closed.
          setInboxTerminalStripVisible(false);
        }

        scheduleInboxLayout(() => {
          if (!nextFocus) {
            setInboxTerminalStripVisible(true);
            writeFlag(TERMINAL_COLLAPSED_KEY, true);
            setTerminalCollapsed(true);
          }
          setInboxContentVisible(true);
          inboxContentVisibleRef.current = true;
          if (nextFocus) {
            setTerminalFocusRequest((count) => count + 1);
          }
        }, INBOX_SLIDE_MS);
      }, fadeOutMs);
    },
    [clearInboxLayoutTimers, scheduleInboxLayout],
  );

  const enterInboxFocusMode = useCallback(() => {
    transitionInboxFocusMode(true);
  }, [transitionInboxFocusMode]);

  const exitInboxFocusMode = useCallback(() => {
    transitionInboxFocusMode(false);
  }, [transitionInboxFocusMode]);

  const focusProjectTaskTerminal = useCallback(() => {
    setTerminalEverOpened(true);
    writeFlag(TERMINAL_COLLAPSED_KEY, false);
    setTerminalCollapsed(false);
    setTerminalFocusRequest((count) => count + 1);
  }, []);

  /** Tab after Escape-blur while inbox focus stays expanded. */
  const focusInboxTerminal = useCallback(() => {
    setTerminalFocusRequest((count) => count + 1);
  }, []);

  /**
   * Keep list-keyboard pathname on the project root while a task is open so
   * drilling into `/{project}/{task}` does not re-sync j/k onto the projects rail.
   */
  const listKeyboardNavPathname = useMemo(() => {
    if (route.inbox) return locationPath || "/inbox";
    if (selectedProjectId && selectedTaskId) {
      return `/${encodeURIComponent(selectedProjectId)}`;
    }
    return locationPath || "/inbox";
  }, [locationPath, route.inbox, selectedProjectId, selectedTaskId]);

  const handleInboxSelectedTaskMeta = useCallback(
    (
      task: {
        id: string;
        title: string;
        projectId: string | null;
        displayId?: string | null;
        status?: string | null;
      } | null,
    ) => {
      setSelectedTaskMeta(task);
      if (task) {
        setSelectedTaskId((current) =>
          current === task.id ? current : task.id,
        );
        setTerminalEverOpened(true);
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
        if (route.inbox) {
          setInboxFocusMode(true);
        }
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
    [client, route.inbox],
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

  // Remember open editor tabs per project when switching projects.
  useEffect(() => {
    const previousId = fileTabsProjectIdRef.current;
    if (previousId && previousId !== selectedProjectId) {
      fileTabsByProjectRef.current.set(previousId, {
        openPaths: openFilePathsRef.current,
        activePath: activeFilePathRef.current,
      });
    }
    fileTabsProjectIdRef.current = selectedProjectId;
    if (!selectedProjectId) {
      setOpenFilePaths([]);
      setActiveFilePath(null);
      return;
    }
    if (previousId === selectedProjectId) return;
    const stored = fileTabsByProjectRef.current.get(selectedProjectId);
    setOpenFilePaths(stored?.openPaths ?? []);
    setActiveFilePath(stored?.activePath ?? null);
  }, [selectedProjectId]);

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
        taskTitle: selectedTaskMeta?.title ?? null,
        taskDisplayId: selectedTaskMeta?.displayId ?? null,
      }),
    [locationPath, selectedProject?.name, selectedTaskMeta],
  );

  const appTabTaskMeta = useMemo(() => {
    if (!route.taskId) {
      return { taskId: null, taskStatus: null };
    }
    if (selectedTaskMeta) {
      return {
        taskId: selectedTaskMeta.id,
        taskStatus: selectedTaskMeta.status ?? null,
      };
    }
    if (selectedTaskId) {
      return { taskId: selectedTaskId, taskStatus: null };
    }
    return { taskId: null, taskStatus: null };
  }, [route.taskId, selectedTaskId, selectedTaskMeta]);

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

  const composeContacts = useMemo(
    () =>
      withAvatarSrc(
        (contacts ?? []).map((contact) => ({
          id: contact.id,
          name: contact.name?.trim() || "Untitled",
          email: contact.email,
          avatarStorageKey: contact.avatarStorageKey,
          updatedAt: contact.updatedAt,
        })),
        contactAvatarSrc,
      ),
    [contactAvatarSrc, contacts],
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

  /** File editor tabs own ⌘T / ⌘⇧[ / ] / ⌘W while any file tab is open. */
  const fileTabsOwnShortcuts =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    githubListTab === "files" &&
    openFilePaths.length > 0 &&
    !selectedCommit &&
    !selectedPullRequest;

  /** ⇧[ on project overview → narrow rail (inbox-style), not full hide. */
  const contentListMinimized =
    tasksCollapsed && !route.inbox && contentStage === "project";
  /** ⇧[ on task focus still hides the side column (task detail is too dense). */
  const contentListHidden =
    tasksCollapsed && !route.inbox && contentStage === "task-focus";

  const workspaceStage =
    contentStage === "task-focus" ? ("task" as const) : ("project" as const);

  const listOpen = route.inbox || Boolean(selectedProjectId);
  const overviewOpen =
    Boolean(selectedProject) && contentStage === "project" && !route.inbox;
  const sideDetailOpen =
    Boolean(selectedProject) && contentStage === "task-focus" && !route.inbox;
  /** Inbox always keeps list + detail columns (empty detail when no task). */
  const inboxDetailOpen = route.inbox;

  const commitDetailOpen =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    Boolean(selectedCommit);
  const pullDetailOpen =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    Boolean(selectedPullRequest) &&
    !selectedCommit;
  const selectedFileWorkingDirectory = selectedProject
    ? normalizeWorkingDirectory(selectedProject.localWorkingDirectory)
    : null;
  const fileDetailOpen =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    githubListTab === "files" &&
    Boolean(activeFilePath) &&
    Boolean(selectedFileWorkingDirectory) &&
    !selectedCommit &&
    !selectedPullRequest;

  // Drop pending editor focus when leaving Files so remounting the pane
  // (tab 1/3/4 → 2) does not steal focus from the tree.
  useEffect(() => {
    if (fileDetailOpen) return;
    setFileEditorFocusRequest(0);
  }, [fileDetailOpen]);

  // File tabs own ⌘T / ⌘⇧[ / ⌘⇧] / ⌘W while any file is open on the Files
  // view. Global app-tab shortcuts resume only after all file tabs are closed.
  useEffect(() => {
    if (!fileTabsOwnShortcuts) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const open = openFilePathsRef.current;
      const active = activeFilePathRef.current;
      if (open.length === 0) return;

      if (!event.shiftKey && event.key.toLowerCase() === "t") {
        // Reserved for the files content section — do not open an app tab.
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        event.shiftKey &&
        (event.key === "[" || event.code === "BracketLeft")
      ) {
        if (!active || open.length < 2) return;
        const index = open.indexOf(active);
        if (index < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const nextIndex = (index - 1 + open.length) % open.length;
        setActiveFilePath(open[nextIndex] ?? active);
        return;
      }

      if (
        event.shiftKey &&
        (event.key === "]" || event.code === "BracketRight")
      ) {
        if (!active || open.length < 2) return;
        const index = open.indexOf(active);
        if (index < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const nextIndex = (index + 1) % open.length;
        setActiveFilePath(open[nextIndex] ?? active);
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "w") {
        if (!active) return;
        event.preventDefault();
        event.stopPropagation();
        const requestClose = requestCloseFileTabRef.current;
        if (requestClose) {
          requestClose(active);
        } else {
          closeFileTabRef.current(active);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [fileTabsOwnShortcuts]);

  // Tasks tab → task list. While Commits/PRs auto-select is pending, keep the
  // previous main content (often tasks) so the pane does not flash blank.
  const tasksListOpen =
    Boolean(selectedProject) &&
    contentStage === "project" &&
    !terminalCollapsed &&
    !selectedCommit &&
    !selectedPullRequest &&
    !(githubListTab === "files" && activeFilePath) &&
    (githubListTab === "tasks" || githubDetailPending);
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
    ((route.inbox &&
      Boolean(selectedTaskId) &&
      // Keep the column painted while focus→browse width is animating
      // (`inboxTerminalStripVisible` flips only after INBOX_SLIDE_MS).
      (inboxFocusMode || !inboxTerminalStripVisible)) ||
      (!route.inbox && contentStage === "task-focus")) &&
    !terminalCollapsed;

  // Inbox: keep the terminal column mounted whenever a task is selected so
  // meta-resolution / strip delay cannot display:none mid-slide.
  // Project: main opens whenever the terminal rail is not collapsed.
  const mainOpen = route.inbox
    ? Boolean(selectedTaskId)
    : Boolean(selectedProjectId) && !terminalCollapsed;

  const listPresence = useStagePresence(listOpen);
  const mainPresence = useStagePresence(mainOpen);
  const overviewPresence = useStagePresence(overviewOpen);
  const sideDetailPresence = useStagePresence(sideDetailOpen);
  const inboxDetailPresence = useStagePresence(inboxDetailOpen);
  const tasksListPresence = useStagePresence(tasksListOpen);
  const commitDetailPresence = useStagePresence(commitDetailOpen);
  const pullDetailPresence = useStagePresence(pullDetailOpen);
  const fileDetailPresence = useStagePresence(fileDetailOpen);
  const terminalPresence = useStagePresence(terminalOpen);

  // Keep --console-list-width applied in inbox focus too so Escape does not
  // suddenly inject the variable (which skipped the reverse width transition).
  const listPanelWidthActive =
    listPresence.mounted &&
    !tasksCollapsed &&
    Boolean(mainOpen || inboxDetailOpen);
  const listResizeHandleEnabled =
    listPanelWidthActive &&
    !inboxFocusMode &&
    inboxTerminalStripVisible;

  const {
    width: listPanelWidth,
    isResizing: listResizing,
    frameRef: contentFrameRef,
    frameStyle: contentFrameStyle,
    onResizePointerDown,
  } = useConsoleListPanelWidth(listPanelWidthActive);

  useLayoutEffect(() => {
    if (!route.inbox) {
      setInboxColumnsWidth(0);
      return;
    }
    const el = inboxColumnsRef.current;
    if (!el) return;
    const apply = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      setInboxColumnsWidth((prev) => (prev === next ? prev : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    route.inbox,
    listPresence.mounted,
    inboxDetailPresence.mounted,
    mainPresence.mounted,
  ]);

  const inboxColumnsStyle = useMemo((): CSSProperties | undefined => {
    if (!route.inbox) return undefined;
    const columnsWidth =
      inboxColumnsWidth > 0
        ? inboxColumnsWidth
        : (contentFrameRef.current?.clientWidth ?? 0);
    if (columnsWidth <= 0) return undefined;
    const widths = computeInboxColumnWidths({
      columnsWidth,
      listPanelWidth,
      focusMode: inboxFocusMode,
      showTerminal: Boolean(selectedTaskId),
    });
    return {
      ["--inbox-list-w" as string]: `${widths.list}px`,
      ["--inbox-detail-w" as string]: `${widths.detail}px`,
      ["--inbox-terminal-w" as string]: `${widths.terminal}px`,
    };
  }, [
    route.inbox,
    inboxColumnsWidth,
    listPanelWidth,
    inboxFocusMode,
    selectedTaskId,
    contentFrameRef,
  ]);

  const [sideSlotEl, setSideSlotEl] = useState<HTMLDivElement | null>(null);
  const [mainSlotEl, setMainSlotEl] = useState<HTMLDivElement | null>(null);

  // Keep TerminalWorkspace mounted after first open so parked PTYs survive exits.
  const mountTerminal = terminalEverOpened || terminalPresence.mounted;

  const shellClass = [
    "console-shell",
    terminalCollapsed ? "console-shell--terminal-collapsed" : null,
    projectsCollapsed ? "console-shell--projects-collapsed" : null,
    tasksCollapsed ? "console-shell--tasks-collapsed" : null,
    route.inbox && inboxFocusMode ? "console-shell--inbox-focus" : null,
    route.inbox ? null : `console-shell--stage-${contentStage}`,
  ]
    .filter(Boolean)
    .join(" ");

  const contentFrameClass = route.inbox
    ? [
        "console-content-frame",
        "console-content-frame--inbox-task",
        inboxFocusMode
          ? "console-content-frame--inbox-focus"
          : "console-content-frame--inbox-browse",
        // Only hide the terminal column when there is truly no selected task —
        // never while focus enter/exit is in flight or meta is still resolving.
        !selectedTaskId ? "console-content-frame--inbox-no-terminal" : null,
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

  const chromeCrumbs = useMemo((): ConsoleBreadcrumbCrumb[] | null => {
    if (selectedPullRequest) {
      const pull = selectedPullRequest.pullRequest;
      const crumbs: ConsoleBreadcrumbCrumb[] = [
        {
          label: `#${pull.number}`,
          title: pull.title,
          emphasis: "id",
          onNavigate: () => {
            setSelectedCommit(null);
            setPullDetailFilePath(null);
            setPullDetailTab("conversation");
          },
        },
      ];

      if (selectedCommit) {
        crumbs.push({
          label: "Commits",
          onNavigate: () => {
            setSelectedCommit(null);
            setPullDetailTab("commits");
          },
        });
        crumbs.push({
          label: githubCommitSubject(selectedCommit.commit.message),
          title: selectedCommit.commit.message,
        });
        return crumbs;
      }

      const tabLabel = pullDetailTabLabel(pullDetailTab);
      crumbs.push({
        label: tabLabel,
      });

      if (pullDetailTab === "files" && pullDetailFilePath) {
        crumbs.push({
          label: basenamePath(pullDetailFilePath),
          title: pullDetailFilePath,
        });
      }

      return crumbs;
    }

    if (selectedCommit) {
      return [
        {
          label: "Commits",
          onNavigate: () => setSelectedCommit(null),
        },
        {
          label: githubCommitSubject(selectedCommit.commit.message),
          title: selectedCommit.commit.message,
        },
      ];
    }

    if (fileDetailOpen && activeFilePath) {
      return [
        {
          label: basenamePath(activeFilePath),
          title: activeFilePath,
        },
      ];
    }

    if (
      sideDetailOpen &&
      selectedTaskMeta &&
      selectedTaskMeta.id === selectedTaskId
    ) {
      if (selectedTaskMeta.displayId) {
        return [
          {
            label: selectedTaskMeta.displayId,
            emphasis: "id",
          },
        ];
      }
      if (selectedTaskMeta.title) {
        return [{ label: selectedTaskMeta.title }];
      }
      return null;
    }

    return null;
  }, [
    activeFilePath,
    fileDetailOpen,
    pullDetailFilePath,
    pullDetailTab,
    selectedCommit,
    selectedPullRequest,
    selectedTaskId,
    selectedTaskMeta,
    sideDetailOpen,
  ]);

  const chromeHasDetail = Boolean(chromeCrumbs && chromeCrumbs.length > 0);

  return (
    <CommandPaletteProvider>
      <ConsoleSettingsShortcut
        enabled={!composeOpen && !route.settings}
        onNavigate={openSettingsFromShortcut}
      />
      <ConsoleTaskPropertyShortcuts
        enabled={!route.settings}
        pathname={locationPath}
      />
      <ConsoleComposeShortcut
        enabled={!composeOpen && !route.settings}
        onCompose={() => setComposeOpen(true)}
      />
      <ListKeyboardNavigationProvider
        pathname={listKeyboardNavPathname}
        escapeReturnsToSidepanel={false}
      >
        <ConsoleInboxFocusModeShortcut
          enabled={route.inbox && !route.settings && !composeOpen}
          inboxFocusMode={inboxFocusMode}
          onExitFocus={exitInboxFocusMode}
          onEnterFocus={enterInboxFocusMode}
        />
        <ConsoleProjectTaskTerminalFocus
          enabled={
            !route.inbox &&
            !route.settings &&
            !composeOpen &&
            Boolean(selectedProjectId)
          }
          taskId={selectedTaskId}
          onFocusTerminal={focusProjectTaskTerminal}
        />
        <ConsoleGithubListTabShortcut
          enabled={
            !composeOpen &&
            !route.settings &&
            !route.inbox &&
            Boolean(selectedProjectId) &&
            !selectedTaskId &&
            // PR 1/2/3 only while the detail is engaged (Enter/Space).
            // Browsing the PR list keeps 1–4 on Tasks/Files/Commits/PRs.
            !(pullDetailHotkeysActive && selectedPullRequest && !selectedCommit)
          }
          onSelectTab={selectGithubListTab}
        />
        <AppTabsProvider
          pathname={locationPath}
          tabTitle={appTabTitle}
          tabTaskMeta={appTabTaskMeta}
          newTabHref={newAppTabHref}
          newTabTitle={newAppTabTitle}
          navigate={navigateAppTab}
          workingTaskIds={workingTaskIds}
          shortcutsEnabled={!fileTabsOwnShortcuts}
        >
          <div className="console-root">
            <ConsoleEscapeBackNavigation
              inboxActive={route.inbox}
              inboxFocusMode={inboxFocusMode}
              selectedProjectId={selectedProjectId}
              selectedTaskId={selectedTaskId}
              selectedCommitSha={selectedCommit?.commit.sha ?? null}
              selectedPullNumber={
                selectedPullRequest?.pullRequest.number ?? null
              }
              selectedFilePath={
                fileDetailOpen ? activeFilePath : null
              }
              onClearFile={clearSelectedFile}
              onDisengagePullDetail={disengagePullDetailHotkeys}
              onExitInboxFocus={exitInboxFocusMode}
              onFocusInboxTerminal={focusInboxTerminal}
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
                  // While a project task owns the terminal, suspend this rail
                  // unless G then P re-arms it (inbox keeps its own focus mode).
                  listKeyboardNavEnabled={
                    route.inbox || !selectedTaskId || projectsRailArmed
                  }
                  onToggleCollapsed={toggleProjectsCollapsed}
                  onCompose={() => setComposeOpen(true)}
                  onSelect={selectProject}
                  onSelectInbox={selectInbox}
                  onOpenAppSettings={openAppSettings}
                  onRetry={reload}
                  onReorder={handleProjectReorder}
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
                      <InboxChromeBreadcrumb
                        pathname={locationPath}
                        onNavigateRoot={exitInboxFocusMode}
                      />
                      <div
                        ref={inboxColumnsRef}
                        className={`console-content-columns${
                          inboxContentVisible
                            ? ""
                            : " console-content-columns--content-hidden"
                        }`}
                        style={inboxColumnsStyle}
                      >
                        {listPresence.mounted && !tasksCollapsed ? (
                          <div
                            className={`console-content-list${
                              listPresence.shown ? " is-shown" : ""
                            }${inboxFocusMode ? " is-minimized" : ""}`}
                          >
                            <InboxAttentionList
                              pathname={locationPath}
                              Link={InboxPanelLink}
                              onNavigate={navigateConsolePath}
                              onActivateFocus={() => {
                                enterInboxFocusMode();
                              }}
                              workingTaskIds={workingTaskIds}
                              minimized={inboxFocusMode}
                              showHeader={false}
                            />
                            {listResizeHandleEnabled ? (
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
                            className={`console-content-inbox-detail main-slot${
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
                              terminalCollapsed={inboxTerminalStripVisible}
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
                            }${
                              inboxTerminalStripVisible
                                ? " is-terminal-strip"
                                : ""
                            }`}
                            aria-hidden={!mainPresence.shown}
                          >
                            {inboxTerminalStripVisible &&
                            selectedTaskId &&
                            inboxTerminalProjectId ? (
                              <button
                                type="button"
                                className="console-terminal-strip"
                                onClick={enterInboxFocusMode}
                                title="Open terminal"
                                aria-label="Open terminal"
                              >
                                <span className="console-terminal-strip-label">
                                  Terminal
                                </span>
                              </button>
                            ) : null}
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
                                    onAgentActivitySummaryChange={
                                      setAgentSummary
                                    }
                                    onAgentStatusItemsChange={
                                      handleAgentStatusItemsChange
                                    }
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
                                    showHeader={false}
                                    collapsed={
                                      inboxTerminalStripVisible ||
                                      !terminalTaskId
                                    }
                                    layoutReady={
                                      terminalPresence.shown &&
                                      !inboxTerminalStripVisible &&
                                      Boolean(terminalTaskId)
                                    }
                                    focusRequest={terminalFocusRequest}
                                  />
                                ) : (
                                  <TerminalDirectoryGate
                                    showHeader={false}
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
                      </div>
                    </AttentionInboxProvider>
                  ) : (
                    <>
                      {selectedProject ? (
                        <ConsoleProjectBreadcrumbHeader
                          className="console-content-chrome"
                          projectId={selectedProject.id}
                          projectIcon={selectedProject.icon}
                          projectName={selectedProject.name}
                          crumbs={chromeCrumbs}
                          leading={
                            selectedCommit ||
                            selectedPullRequest ||
                            fileDetailOpen ? (
                              <button
                                type="button"
                                className="console-commit-detail-back"
                                aria-label={
                                  selectedCommit && selectedPullRequest
                                    ? "Back to pull request"
                                    : "Back to project"
                                }
                                onClick={() => {
                                  if (fileDetailOpen) {
                                    clearSelectedFile();
                                    return;
                                  }
                                  if (selectedCommit) {
                                    if (selectedPullRequest) {
                                      navigateToParentPull();
                                    } else {
                                      clearSelectedCommit();
                                    }
                                    return;
                                  }
                                  clearSelectedPullRequest();
                                }}
                              >
                                <ProjectOcticon icon="chevron-left" size={14} />
                              </button>
                            ) : null
                          }
                          onNavigateToProject={
                            chromeHasDetail
                              ? () => {
                                  if (
                                    selectedCommit ||
                                    selectedPullRequest ||
                                    fileDetailOpen
                                  ) {
                                    clearSelectedCommit();
                                    clearSelectedPullRequest();
                                    clearSelectedFile();
                                    return;
                                  }
                                  selectTaskId(null);
                                }
                              : undefined
                          }
                          onSaveProjectName={
                            chromeHasDetail
                              ? undefined
                              : saveSelectedProjectName
                          }
                          onIconChange={(icon) => {
                            void patchSelectedProject({ icon });
                          }}
                          actions={
                            <ConsoleRunApplicationButton
                              projectId={selectedProject.id}
                              cwd={normalizeWorkingDirectory(
                                selectedProject.localWorkingDirectory,
                              )}
                              panelApiRef={runApplicationPanelApiRef}
                            />
                          }
                        />
                      ) : null}
                      <div
                        className={`console-content-columns${
                          contentListMinimized ? " is-list-minimized" : ""
                        }${
                          projectListContentVisible
                            ? ""
                            : " console-content-columns--content-hidden"
                        }`}
                        style={
                          contentListMinimized
                            ? {
                                gridTemplateColumns: `${INBOX_FOCUS_LIST_WIDTH}px minmax(0, 1fr)`,
                              }
                            : undefined
                        }
                      >
                  {listPresence.mounted && !contentListHidden ? (
                    <div
                      className={`console-content-list${
                        listPresence.shown ? " is-shown" : ""
                      }${terminalCollapsed ? " is-expanded" : ""}${
                        contentListMinimized ? " is-minimized" : ""
                      }`}
                    >
                      {selectedProject ? (
                        <div className="console-side-stack">
                          <div className="console-side-bodies">
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
                                      selectedPullRequest?.pullRequest
                                        .number ?? null
                                    }
                                    onSelectPullRequest={selectPullRequest}
                                    selectedFilePath={activeFilePath}
                                    onSelectFile={selectFile}
                                    onFileEntryDeleted={handleFsEntryDeleted}
                                    fileTreeRefreshToken={fileTreeRefreshToken}
                                    minimized={contentListMinimized}
                                    showHeader={false}
                                    pullDetailEngaged={pullDetailHotkeysActive}
                                  />
                                </div>
                              ) : null}
                            </div>
                            <div
                              className={`console-side-layer console-side-layer--detail main-slot${
                                sideDetailPresence.shown ? " is-shown" : ""
                              }`}
                              aria-hidden={!sideDetailPresence.shown}
                              ref={setSideSlotEl}
                            />
                          </div>
                        </div>
                      ) : null}
                      {listPanelWidthActive && !route.inbox ? (
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
                                projectIcon={selectedProject.icon}
                                projectName={selectedProject.name}
                                commit={selectedCommit.commit}
                                repository={selectedCommit.repository}
                                parentPullRequest={
                                  selectedPullRequest?.pullRequest ?? null
                                }
                                showChromeHeader={false}
                                onClose={clearSelectedCommit}
                                onNavigateToProject={() => {
                                  clearSelectedCommit();
                                  clearSelectedPullRequest();
                                }}
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
                                projectIcon={selectedProject.icon}
                                projectName={selectedProject.name}
                                pullRequest={selectedPullRequest.pullRequest}
                                repository={selectedPullRequest.repository}
                                tab={pullDetailTab}
                                onTabChange={selectPullDetailTab}
                                hotkeysEnabled={pullDetailHotkeysActive}
                                showChromeHeader={false}
                                onClose={clearSelectedPullRequest}
                                onNavigateToProject={clearSelectedPullRequest}
                                onSelectedFilenameChange={setPullDetailFilePath}
                                onSelectCommit={(commit, repository) => {
                                  selectCommit(commit, repository, {
                                    fromPullRequest:
                                      selectedPullRequest.pullRequest,
                                  });
                                }}
                              />
                            </div>
                          ) : null}
                          {fileDetailPresence.mounted &&
                          activeFilePath &&
                          selectedFileWorkingDirectory ? (
                            <div
                              className={`console-content-main-commit${
                                fileDetailPresence.shown ? " is-shown" : ""
                              }`}
                              aria-hidden={!fileDetailPresence.shown}
                            >
                              <FileDetailPane
                                projectIcon={selectedProject.icon}
                                projectName={selectedProject.name}
                                workingDirectory={selectedFileWorkingDirectory}
                                openPaths={openFilePaths}
                                activePath={activeFilePath}
                                showChromeHeader={false}
                                editorFocusRequest={fileEditorFocusRequest}
                                requestClosePathRef={requestCloseFileTabRef}
                                onActivatePath={setActiveFilePath}
                                onClosePath={closeFileTab}
                                onClose={clearSelectedFile}
                                onNavigateToProject={clearSelectedFile}
                                onFileDeleted={handleFsEntryDeleted}
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
                                  onAgentStatusItemsChange={
                                    handleAgentStatusItemsChange
                                  }
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
                                  showHeader={false}
                                  collapsed={
                                    terminalCollapsed || !terminalTaskId
                                  }
                                  layoutReady={
                                    terminalPresence.shown &&
                                    !terminalCollapsed &&
                                    Boolean(terminalTaskId)
                                  }
                                  focusRequest={terminalFocusRequest}
                                />
                              ) : (
                                <TerminalDirectoryGate
                                  showHeader={false}
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
                      </div>
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
                    showChromeHeader={false}
                    showListHeader={false}
                    onSelectedTaskChange={setSelectedTaskMeta}
                    workingTaskIds={workingTaskIds}
                    agentOpenTaskIds={agentOpenTaskIds}
                    activityFeedRevision={activityFeedRevision}
                    onActivityFeedInvalidate={invalidateActivityFeed}
                    agentStatusHandlersRef={agentStatusHandlersRef}
                    onAttachAgentSession={handleAttachAgentSession}
                    onEndAgentSession={handleEndAgentSession}
                    onFocusTerminal={focusProjectTaskTerminal}
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
                  leading={
                    <>
                      <StatusBarAgents
                        summary={agentSummary}
                        items={agentStatusItems}
                        projectKeys={statusBarProjectKeys}
                        onNavigate={navigateToAgentItem}
                      />
                      <StatusBarApps
                        projectNames={statusBarProjectNames}
                        onNavigate={navigateToAppSession}
                      />
                    </>
                  }
                />
              </div>
            </footer>
          </div>
          <ComposeModal
            open={composeOpen}
            onOpenChange={setComposeOpen}
            pathname={composePathname}
            projects={composeProjects}
            contacts={composeContacts}
            defaultAssigneeId={defaultAssigneeId}
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
          <ConsoleDestinationNavigate
            enabled={!composeOpen && !route.settings}
            inboxActive={route.inbox}
            inboxFocusMode={inboxFocusMode}
            firstProjectId={firstProjectId}
            onSelectInbox={selectInbox}
            onExitInboxFocus={exitInboxFocusMode}
            onEnsureProjectsExpanded={ensureProjectsExpanded}
            onArmProjectsRail={armProjectsRail}
            navigatePath={navigateConsolePath}
            locationPath={locationPath}
            selectedProjectId={selectedProjectId}
            selectedProjectName={selectedProject?.name ?? null}
            codebaseProjectIds={codebaseProjectIds}
          />
        </AppTabsProvider>
      </ListKeyboardNavigationProvider>
    </CommandPaletteProvider>
  );
}
