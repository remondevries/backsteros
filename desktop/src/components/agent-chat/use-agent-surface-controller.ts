import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { AgentChatTurnUiState } from "../../lib/agent/agent-acp-activity";
import type {
  AgentChatMessage,
  AgentChatViewMode,
  AgentChatViewScope,
} from "../../lib/agent/agent-chat-transcript";
import { latestAgentChatChangedFiles } from "../../lib/agent/agent-chat-timeline";
import {
  BLUR_AGENT_FILES_TREE_EVENT,
  blurAgentTerminal,
  blurBrowserAddress,
  blurFilesSurface,
  focusAgentTerminal,
  focusBrowserAddress,
  focusFilesTreeFirstItem,
  isInsideBrowserAddress,
  isInsideFilesSurface,
  isInsideTerminalSurface,
} from "../../lib/agent/agent-surface-focus";
import {
  addAgentSurfaceTab,
  closeAgentSurfaceTab,
  isAgentSurfaceCloseTabShortcut,
  resolveAdjacentAgentSurfaceTabId,
  resolveAgentSurfaceTabCycleShortcut,
  updateAgentSurfaceTab,
  type AgentSurfaceTab,
  type AgentSurfaceTabKind,
  type AgentSurfaceTabsState,
} from "../../lib/agent/agent-surface-tabs";
import { isAgentSurfaceAddMenuShortcut } from "../../lib/agent/agent-surface-add-menu-shortcut";
import {
  resolveAgentSurfaceDigitShortcut,
  type AgentSurfaceQuickOpenKind,
} from "../../lib/agent/agent-surface-quick-open-shortcut";
import {
  AGENT_CHAT_COMPOSER_FOCUS_ATTR,
  type DesktopAgentChatComposerHandle,
} from "../desktop-agent-chat-composer";
import {
  isEditableFocusTarget,
  isInsideAgentChatComposer,
} from "./agent-chat-panel-helpers";

/**
 * Tab focuses the active surface’s primary control; Escape unfocuses so
 * task shortcuts (e.g. S) work. Chat never auto-focuses — only Tab / click.
 */
export function useAgentSurfaceFocusShortcuts({
  collapsed,
  viewMode,
  surfaceTabs,
  activeSurfaceTabId,
  composerRef,
  rootRef,
}: {
  collapsed: boolean;
  viewMode: AgentChatViewMode;
  surfaceTabs: AgentSurfaceTab[];
  activeSurfaceTabId: string | null;
  composerRef: RefObject<DesktopAgentChatComposerHandle | null>;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (collapsed || viewMode !== "chat") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest("[data-compose-modal]")) return;
        if (target.closest("[data-command-palette]")) return;
        if (target.closest("[data-searchable-dropdown-panel]")) return;
      }

      const active = document.activeElement;
      const activeTab =
        surfaceTabs.find((tab) => tab.id === activeSurfaceTabId) ?? null;
      const kind = activeTab?.kind ?? null;

      if (event.key === "Escape") {
        if (event.defaultPrevented) return;

        if (kind === "chat") {
          if (!isInsideAgentChatComposer(active)) return;
          event.preventDefault();
          event.stopPropagation();
          composerRef.current?.blur();
          if (active instanceof HTMLElement) active.blur();
          return;
        }
        if (kind === "browser") {
          if (!blurBrowserAddress(active)) return;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (kind === "files") {
          if (
            !isInsideFilesSurface(active) &&
            !isInsideFilesSurface(event.target)
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (!blurFilesSurface(active)) {
            window.dispatchEvent(new CustomEvent(BLUR_AGENT_FILES_TREE_EVENT));
            if (active instanceof HTMLElement) active.blur();
          }
          return;
        }
        if (kind === "terminal") {
          if (!blurAgentTerminal(active, activeTab?.id)) return;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        return;
      }

      if (event.key !== "Tab" || event.shiftKey) return;

      if (kind === "chat") {
        // Focused: leave Tab to the Lexical composer (slash/@ menus). Escape exits.
        if (isInsideAgentChatComposer(active)) return;
        // Leave other editors / comment composers alone (their own Tab flows).
        if (isEditableFocusTarget(active)) return;

        // Do not bail on defaultPrevented — app-shell useBlockBrowserTabFocus
        // preventDefaults Tab first (capture) to stop browser focus cycling.
        // We still need to move focus into the composer.
        const composer = rootRef.current?.querySelector<HTMLElement>(
          `[${AGENT_CHAT_COMPOSER_FOCUS_ATTR}="composer"]`,
        );
        if (
          !composer ||
          composer.getAttribute("contenteditable") === "false" ||
          (composer instanceof HTMLTextAreaElement && composer.disabled)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        composerRef.current?.focus();
        return;
      }

      if (kind === "browser") {
        if (isInsideBrowserAddress(active)) return;
        if (isEditableFocusTarget(active)) return;
        if (!focusBrowserAddress(rootRef.current)) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (kind === "files") {
        if (isInsideFilesSurface(active)) return;
        if (isEditableFocusTarget(active)) return;
        if (!focusFilesTreeFirstItem(rootRef.current)) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (kind === "terminal") {
        if (isInsideTerminalSurface(active)) return;
        if (isEditableFocusTarget(active)) return;
        event.preventDefault();
        event.stopPropagation();
        focusAgentTerminal(activeTab?.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeSurfaceTabId, collapsed, surfaceTabs, viewMode]);
}

/** Surface tab open/close/activate handlers + ⌘N / ⌥T / ⌥[ ] / ⌥W shortcuts. */
export function useAgentSurfaceTabsController({
  collapsed,
  cwd,
  viewScope,
  sessionReady,
  startingAgent,
  onStartAgent,
  onExpand,
  surfaceTabs,
  surfaceTabState,
  displayMessages,
  turnUi,
  setSurfaceTabState,
  setAddMenuOpen,
  clearComposerDraft,
  setSendError,
  handleStopAgent,
}: {
  collapsed: boolean;
  cwd: string | null;
  viewScope: AgentChatViewScope;
  sessionReady: boolean;
  startingAgent: boolean;
  onStartAgent?: () => void;
  onExpand?: () => void;
  surfaceTabs: AgentSurfaceTab[];
  surfaceTabState: AgentSurfaceTabsState;
  displayMessages: AgentChatMessage[];
  turnUi: AgentChatTurnUiState;
  setSurfaceTabState: Dispatch<SetStateAction<AgentSurfaceTabsState>>;
  setAddMenuOpen: Dispatch<SetStateAction<boolean>>;
  clearComposerDraft: () => void;
  setSendError: Dispatch<SetStateAction<string | null>>;
  handleStopAgent: () => void;
}) {
  const handleActivateSurfaceTab = useCallback((id: string) => {
    setSurfaceTabState((current) =>
      current.activeId === id ? current : { ...current, activeId: id },
    );
  }, []);

  const handleAddSurface = useCallback((kind: AgentSurfaceTabKind) => {
    setSurfaceTabState((current) => addAgentSurfaceTab(current.tabs, kind));
  }, []);

  /** Empty-picker / ⌘N selection — Agent also starts a session when needed. */
  const handlePickerAddSurface = useCallback(
    (kind: AgentSurfaceQuickOpenKind) => {
      handleAddSurface(kind);
      if (kind !== "chat") return;
      if (sessionReady || startingAgent || !onStartAgent) return;
      clearComposerDraft();
      setSendError(null);
      onStartAgent();
    },
    [
      clearComposerDraft,
      handleAddSurface,
      onStartAgent,
      sessionReady,
      startingAgent,
    ],
  );

  const handleCloseSurfaceTab = useCallback(
    (id: string) => {
      const tab = surfaceTabs.find((entry) => entry.id === id);
      // Closing Chat ends the ACP session (replaces the old Stop button).
      if (tab?.kind === "chat" && sessionReady) {
        handleStopAgent();
      }
      setSurfaceTabState((current) =>
        closeAgentSurfaceTab(current.tabs, id, current.activeId),
      );
    },
    [handleStopAgent, sessionReady, surfaceTabs],
  );

  const surfaceTabStateRef = useRef(surfaceTabState);
  surfaceTabStateRef.current = surfaceTabState;
  const handleCloseSurfaceTabRef = useRef(handleCloseSurfaceTab);
  handleCloseSurfaceTabRef.current = handleCloseSurfaceTab;
  const handlePickerAddSurfaceRef = useRef(handlePickerAddSurface);
  handlePickerAddSurfaceRef.current = handlePickerAddSurface;
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;
  const cwdAvailableRef = useRef(Boolean(cwd?.trim()));
  cwdAvailableRef.current = Boolean(cwd?.trim());
  const chatPickerAvailableRef = useRef(
    sessionReady || Boolean(onStartAgent),
  );
  chatPickerAvailableRef.current = sessionReady || Boolean(onStartAgent);
  const isCodebaseProject = viewScope === "codebase";
  const isCodebaseProjectRef = useRef(isCodebaseProject);
  isCodebaseProjectRef.current = isCodebaseProject;
  const diffAvailable =
    latestAgentChatChangedFiles(displayMessages, turnUi.activities).length > 0;
  const diffAvailableRef = useRef(diffAvailable);
  diffAvailableRef.current = diffAvailable;

  // ⌘N: empty picker → open surfaces; with tabs → activate Nth tab
  // (also while collapsed → expands). ⌥T opens + when tabs exist;
  // ⌥[ / ⌥] cycle; ⌥W closes. Other tab chrome only when expanded.
  useEffect(() => {
    if (collapsed) {
      setAddMenuOpen(false);
    }

    function isBlockingUiTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest("[data-compose-modal]") ||
          target.closest("[data-command-palette]") ||
          target.closest("[data-blocking-modal]") ||
          target.closest("[data-searchable-dropdown-panel]"),
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isBlockingUiTarget(event.target)) return;

      const currentTabs = surfaceTabStateRef.current;
      const digitShortcut = resolveAgentSurfaceDigitShortcut(event, {
        isCodebaseProject: isCodebaseProjectRef.current,
        diffAvailable: diffAvailableRef.current,
        tabCount: currentTabs.tabs.length,
      });
      if (digitShortcut != null) {
        if (digitShortcut.action === "activate-tab") {
          const tab = currentTabs.tabs[digitShortcut.index];
          if (!tab) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          setAddMenuOpen(false);
          if (collapsed) onExpandRef.current?.();
          if (tab.id !== currentTabs.activeId) {
            setSurfaceTabState({ ...currentTabs, activeId: tab.id });
          }
          return;
        }

        const quickOpen = digitShortcut.kind;
        if (quickOpen === "chat" && !chatPickerAvailableRef.current) return;
        if (quickOpen === "files" && !cwdAvailableRef.current) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setAddMenuOpen(false);
        if (collapsed) onExpandRef.current?.();
        handlePickerAddSurfaceRef.current(quickOpen);
        return;
      }

      if (collapsed) return;

      if (isAgentSurfaceAddMenuShortcut(event)) {
        // + menu only when at least one surface tab is open.
        if (surfaceTabStateRef.current.tabs.length === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setAddMenuOpen((open) => !open);
        return;
      }

      if (isAgentSurfaceCloseTabShortcut(event)) {
        const current = surfaceTabStateRef.current;
        const id = current.activeId ?? current.tabs[0]?.id;
        if (!id) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setAddMenuOpen(false);
        handleCloseSurfaceTabRef.current(id);
        return;
      }

      const direction = resolveAgentSurfaceTabCycleShortcut(event);
      if (direction == null) return;

      const current = surfaceTabStateRef.current;
      const nextId = resolveAdjacentAgentSurfaceTabId(
        current.tabs,
        current.activeId,
        direction,
      );
      if (!nextId || nextId === current.activeId) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setAddMenuOpen(false);
      setSurfaceTabState({ ...current, activeId: nextId });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [collapsed]);

  const handleBrowserUrlChange = useCallback(
    (tabId: string, url: string, title: string) => {
      setSurfaceTabState((current) => ({
        ...current,
        tabs: updateAgentSurfaceTab(current.tabs, tabId, {
          resourceId: url,
          title,
        }),
      }));
    },
    [],
  );

  return {
    handleActivateSurfaceTab,
    handleAddSurface,
    handlePickerAddSurface,
    handleCloseSurfaceTab,
    handleBrowserUrlChange,
    isCodebaseProject,
    diffAvailable,
  };
}
