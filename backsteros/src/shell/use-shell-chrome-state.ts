import { useCallback, useEffect, useRef, useState } from "react";
import { useShellLocation } from "../lib/shell-route-keep-alive";

import {
  CONTEXT_PANEL_COLLAPSE_DURATION_MS,
  CHAT_PANEL_COLLAPSE_DURATION_MS,
  CHAT_PANEL_VISIBLE_STORAGE_KEY,
  clearGoLeaderSequence,
  clearFinanceLeaderSequence,
  clearPersonalAssistantDoubleA,
  consumePersonalAssistantDoubleA,
  isChatPanelToggleShortcut,
  isFinanceLeaderSequencePending,
  isFocusInsideShellChatPanel,
  isGoLeaderSequencePending,
  isPersonalAssistantDoubleAKey,
  isPersonalAssistantDoubleAPending,
  isShellChatSlashMenuOpen,
  plainAShortcutEvent,
  readStoredChatPanelCollapsed,
  readStoredChatPanelWidth,
  scheduleFocusShellChatComposer,
  setPersonalAssistantDoubleAHandler,
  setPersonalAssistantSingleAHandler,
  SIDEBAR_COLLAPSE_DURATION_MS,
  shouldHandleGlobalShortcut,
  tryOpenPropertyDropdownForShortcutEvent,
  useBlockBrowserTabFocus,
  useComposeShortcut,
  useContentPreviewScrollShortcuts,
  useContentSidePanelToggleShortcut,
  useDocumentTreeCreateFolderShortcut,
  useCommandPaletteActions,
  useCommandPaletteRuntimeRefs,
  useSettingsShortcut,
  installSelectAllShortcutListeners,
  installClearSelectionShortcutListeners,
  installCopyEntityIdShortcutListeners,
} from "@backsteros/ui/shell";
import {
  getTodayJournalDateSlug,
  useEscapeBackNavigation,
  useFinanceNavigationShortcuts,
  useListBoardViewShortcuts,
  useNavigationShortcuts,
  useSectionTabShortcuts,
} from "@backsteros/ui/navigation";
import { useTaskPropertyDropdownShortcuts } from "@backsteros/ui/tasks";

import { useDesktopApi } from "../lib/api-context";
import {
  getDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "../lib/default-assignee";
import {
  firstKnowledgeDocumentIdForWarm,
  firstLetterIdForWarm,
  warmWorkspaceDetailCaches,
} from "../lib/prefetch-workspace-content";
import {
  preloadGoNavigationRouteChunks,
  preloadKeepAliveSectionChunks,
  preloadShellSidePanels,
} from "../lib/preload-shell-route-chunk";
import { preloadShellRouteChunks } from "../router/shell-route-modules";
import { useComposeGlobalShortcut } from "../lib/use-compose-global-shortcut";
import { useCommandPaletteGlobalShortcut } from "../lib/use-command-palette-global-shortcut";
import { useTauriWindowFullscreen } from "../lib/use-tauri-window-fullscreen";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceMeta,
  useDesktopWorkspaceProjects,
} from "../lib/workspace-data";
import type { useShellTabs } from "./use-shell-tabs";

/** Collapse chat before the left nav when the window gets tight. */
const CHAT_NARROW_BREAKPOINT_PX = 1180;
const SIDEBAR_NARROW_BREAKPOINT_PX = 900;

export function useShellChromeState() {
  const [composeOpen, setComposeOpen] = useState(false);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [sidePanelAnimating, setSidePanelAnimating] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
  const [chatPanelCollapsed, setChatPanelCollapsed] = useState(false);
  const [chatPanelAnimating, setChatPanelAnimating] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(360);
  const windowFullscreen = useTauriWindowFullscreen();
  const [defaultAssigneeId, setDefaultAssigneeIdState] = useState<string | null>(
    () => getDefaultAssigneeId(),
  );
  /** One-shot override when compose is opened with an explicit assignee. */
  const [composeAssigneeOverride, setComposeAssigneeOverride] = useState<
    string | null | undefined
  >(undefined);
  /** One-shot Related contacts when compose is opened from a contact. */
  const [composeRelatedContactIdsOverride, setComposeRelatedContactIdsOverride] =
    useState<string[] | undefined>(undefined);
  const sidePanelAnimTimerRef = useRef<number | null>(null);
  const sidePanelAnimRafRef = useRef<number | null>(null);
  const sidebarAnimTimerRef = useRef<number | null>(null);
  const sidebarAnimRafRef = useRef<number | null>(null);
  const chatPanelAnimTimerRef = useRef<number | null>(null);
  const chatPanelAnimRafRef = useRef<number | null>(null);
  const chatPanelCollapsedRef = useRef(chatPanelCollapsed);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const { openRef: commandPaletteOpenRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    chatPanelCollapsedRef.current = chatPanelCollapsed;
  }, [chatPanelCollapsed]);
  useEffect(() => {
    sidebarCollapsedRef.current = sidebarCollapsed;
  }, [sidebarCollapsed]);

  const beginCollapseAnimation = useCallback(
    (
      setAnimating: (value: boolean) => void,
      timerRef: { current: number | null },
      rafRef: { current: number | null },
      durationMs: number,
      apply: () => void,
    ) => {
      setAnimating(true);
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          apply();
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setAnimating(false);
          }, durationMs);
        });
      });
    },
    [],
  );

  /** `[` — enable width transition for one paint, then flip collapsed. */
  const toggleSidebarCollapsed = useCallback(() => {
    beginCollapseAnimation(
      setSidebarAnimating,
      sidebarAnimTimerRef,
      sidebarAnimRafRef,
      SIDEBAR_COLLAPSE_DURATION_MS,
      () => {
        setSidebarCollapsed((current) => {
          const next = !current;
          localStorage.setItem("backsteros:sidebar-visible", String(!next));
          return next;
        });
      },
    );
  }, [beginCollapseAnimation]);

  /** ⇧[ — enable width transition for one paint, then flip collapsed. */
  const toggleSidePanelCollapsed = useCallback(() => {
    beginCollapseAnimation(
      setSidePanelAnimating,
      sidePanelAnimTimerRef,
      sidePanelAnimRafRef,
      CONTEXT_PANEL_COLLAPSE_DURATION_MS,
      () => {
        setSidePanelCollapsed((current) => !current);
      },
    );
  }, [beginCollapseAnimation]);

  /** `]` — global right chat column (page agent rails capture and win first). */
  const toggleChatPanelCollapsed = useCallback(() => {
    beginCollapseAnimation(
      setChatPanelAnimating,
      chatPanelAnimTimerRef,
      chatPanelAnimRafRef,
      CHAT_PANEL_COLLAPSE_DURATION_MS,
      () => {
        setChatPanelCollapsed((current) => {
          const next = !current;
          localStorage.setItem(CHAT_PANEL_VISIBLE_STORAGE_KEY, String(!next));
          return next;
        });
      },
    );
  }, [beginCollapseAnimation]);

  const setChatPanelCollapsedPreferring = useCallback(
    (collapsed: boolean) => {
      if (chatPanelCollapsedRef.current === collapsed) return;
      beginCollapseAnimation(
        setChatPanelAnimating,
        chatPanelAnimTimerRef,
        chatPanelAnimRafRef,
        CHAT_PANEL_COLLAPSE_DURATION_MS,
        () => {
          setChatPanelCollapsed(collapsed);
          localStorage.setItem(
            CHAT_PANEL_VISIBLE_STORAGE_KEY,
            String(!collapsed),
          );
        },
      );
    },
    [beginCollapseAnimation],
  );

  const setSidebarCollapsedPreferring = useCallback(
    (collapsed: boolean) => {
      if (sidebarCollapsedRef.current === collapsed) return;
      beginCollapseAnimation(
        setSidebarAnimating,
        sidebarAnimTimerRef,
        sidebarAnimRafRef,
        SIDEBAR_COLLAPSE_DURATION_MS,
        () => {
          setSidebarCollapsed(collapsed);
          localStorage.setItem("backsteros:sidebar-visible", String(!collapsed));
        },
      );
    },
    [beginCollapseAnimation],
  );

  useEffect(() => {
    const sidePanelTimer = sidePanelAnimTimerRef;
    const sidePanelRaf = sidePanelAnimRafRef;
    const sidebarTimer = sidebarAnimTimerRef;
    const sidebarRaf = sidebarAnimRafRef;
    const chatPanelTimer = chatPanelAnimTimerRef;
    const chatPanelRaf = chatPanelAnimRafRef;
    return () => {
      if (sidePanelTimer.current != null) {
        window.clearTimeout(sidePanelTimer.current);
      }
      if (sidePanelRaf.current != null) {
        window.cancelAnimationFrame(sidePanelRaf.current);
      }
      if (sidebarTimer.current != null) {
        window.clearTimeout(sidebarTimer.current);
      }
      if (sidebarRaf.current != null) {
        window.cancelAnimationFrame(sidebarRaf.current);
      }
      if (chatPanelTimer.current != null) {
        window.clearTimeout(chatPanelTimer.current);
      }
      if (chatPanelRaf.current != null) {
        window.cancelAnimationFrame(chatPanelRaf.current);
      }
    };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("backsteros:sidebar-visible");
    if (stored === null) return;
    const frame = requestAnimationFrame(() =>
      setSidebarCollapsed(stored === "false"),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setChatPanelCollapsed(readStoredChatPanelCollapsed());
      setChatPanelWidth(readStoredChatPanelWidth());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    installSelectAllShortcutListeners();
    installClearSelectionShortcutListeners();
    installCopyEntityIdShortcutListeners();
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "[") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      toggleSidebarCollapsed();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [toggleSidebarCollapsed]);

  useEffect(() => {
    // Bubble phase so page agent rails (capture + `]`) win when present.
    const listener = (event: KeyboardEvent) => {
      if (!isChatPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      toggleChatPanelCollapsed();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [toggleChatPanelCollapsed]);

  useEffect(() => {
    // A A (fast) toggles personal-assistant chat; single A defers to assignee.
    setPersonalAssistantDoubleAHandler(() => {
      const opening = chatPanelCollapsedRef.current;
      toggleChatPanelCollapsed();
      if (opening) {
        scheduleFocusShellChatComposer();
      }
    });
    setPersonalAssistantSingleAHandler(() => {
      tryOpenPropertyDropdownForShortcutEvent(plainAShortcutEvent());
    });
    return () => {
      setPersonalAssistantDoubleAHandler(null);
      setPersonalAssistantSingleAHandler(null);
      clearPersonalAssistantDoubleA();
    };
  }, [toggleChatPanelCollapsed]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat) return;

      // Escape while the chat column owns focus → blur only (A A toggles visibility).
      // Slash menu keeps Escape to dismiss the menu first.
      if (event.key === "Escape") {
        if (chatPanelCollapsedRef.current) return;
        if (commandPaletteOpenRef.current) return;
        if (isShellChatSlashMenuOpen()) return;
        if (!isFocusInsideShellChatPanel(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.target instanceof HTMLElement) {
          event.target.blur();
        }
        return;
      }

      // Other keys cancel a waiting single-A (do not open assignee).
      if (
        isPersonalAssistantDoubleAPending() &&
        !isPersonalAssistantDoubleAKey(event)
      ) {
        clearPersonalAssistantDoubleA();
        return;
      }

      if (!isPersonalAssistantDoubleAKey(event)) return;
      if (commandPaletteOpenRef.current) return;
      if (isGoLeaderSequencePending() || isFinanceLeaderSequencePending()) {
        return;
      }
      // First A must be a valid global shortcut; second A may arrive after
      // focus moved — still complete the chord while pending.
      if (
        !isPersonalAssistantDoubleAPending() &&
        !shouldHandleGlobalShortcut(event)
      ) {
        return;
      }

      if (!consumePersonalAssistantDoubleA(event)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      clearGoLeaderSequence();
      clearFinanceLeaderSequence();
    };
    // Capture so we defer assignee before property-dropdown handlers run.
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [commandPaletteOpenRef]);

  useEffect(() => {
    const applyNarrowLayout = () => {
      const width = window.innerWidth;
      if (width < CHAT_NARROW_BREAKPOINT_PX) {
        setChatPanelCollapsedPreferring(true);
      }
      if (width < SIDEBAR_NARROW_BREAKPOINT_PX) {
        setSidebarCollapsedPreferring(true);
      }
    };
    applyNarrowLayout();
    window.addEventListener("resize", applyNarrowLayout);
    return () => window.removeEventListener("resize", applyNarrowLayout);
  }, [setChatPanelCollapsedPreferring, setSidebarCollapsedPreferring]);

  return {
    composeOpen,
    setComposeOpen,
    sidePanelCollapsed,
    setSidePanelCollapsed,
    sidePanelAnimating,
    toggleSidePanelCollapsed,
    sidebarCollapsed,
    sidebarAnimating,
    chatPanelCollapsed,
    chatPanelAnimating,
    chatPanelWidth,
    setChatPanelWidth,
    toggleChatPanelCollapsed,
    windowFullscreen,
    defaultAssigneeId,
    setDefaultAssigneeIdState,
    composeAssigneeOverride,
    setComposeAssigneeOverride,
    composeRelatedContactIdsOverride,
    setComposeRelatedContactIdsOverride,
  };
}

export function useShellBootEffects({
  setDefaultAssigneeIdState,
}: {
  setDefaultAssigneeIdState: (id: string | null) => void;
}) {
  const { client } = useDesktopApi();
  const { ready } = useDesktopWorkspaceMeta();
  const { reloadHabits } = useDesktopWorkspaceActions();
  const { journalDocumentIdsByDate, knowledgeDocuments } =
    useDesktopWorkspaceDocuments();
  const { letters } = useDesktopWorkspaceProjects();
  const todayJournalSlug = getTodayJournalDateSlug();
  const todayJournalDocumentId =
    journalDocumentIdsByDate[todayJournalSlug] ?? null;
  const firstKnowledgeDocumentId =
    firstKnowledgeDocumentIdForWarm(knowledgeDocuments);
  const firstLetterId = firstLetterIdForWarm(letters);

  useEffect(() => {
    preloadKeepAliveSectionChunks();
    const preloadRest = () => {
      void preloadShellRouteChunks();
      void preloadShellSidePanels();
    };
    // `"requestIdleCallback" in window` narrows `window` to `never` in the
    // fallback branch (lib.dom always declares it) — use a typeof check.
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preloadRest);
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(preloadRest, 300);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!ready) return;
    warmWorkspaceDetailCaches(client, {
      todayJournal: {
        dateSlug: todayJournalSlug,
        documentId: todayJournalDocumentId,
      },
      firstKnowledgeDocumentId,
      firstLetterId,
    });
  }, [
    client,
    firstKnowledgeDocumentId,
    firstLetterId,
    todayJournalDocumentId,
    todayJournalSlug,
    ready,
  ]);

  useEffect(() => {
    if (!ready) return;
    void reloadHabits().catch(() => {});
    // reloadHabits is stable; do not re-fetch when habit/task rows update.
  }, [todayJournalSlug, ready, reloadHabits]);

  useEffect(() => {
    let cancelled = false;
    void client
      .requestJson<{ settings: Record<string, unknown> }>("/api/v1/settings")
      .then((body) => {
        if (cancelled) return;
        setDefaultAssigneeIdState(
          syncDefaultAssigneeIdFromSettings(body.settings),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, setDefaultAssigneeIdState]);
}

export function useShellShortcuts({
  tabs,
  setComposeOpen,
  setComposeAssigneeOverride,
  setComposeRelatedContactIdsOverride,
  showSidePanel,
  panelPathname,
  toggleSidePanelCollapsed,
}: {
  tabs: ReturnType<typeof useShellTabs>;
  setComposeOpen: (open: boolean) => void;
  setComposeAssigneeOverride: (id: string | null | undefined) => void;
  setComposeRelatedContactIdsOverride: (ids: string[] | undefined) => void;
  showSidePanel: boolean;
  panelPathname: string;
  toggleSidePanelCollapsed: () => void;
}) {
  const location = useShellLocation();
  const search = location.searchStr;
  const { openSearch, openGo, openFinanceGo, setOpen } =
    useCommandPaletteActions();
  const { openRef } = useCommandPaletteRuntimeRefs();
  const { history, navigateTo } = tabs;

  const closePalette = useCallback(() => setOpen(false), [setOpen]);

  const openGoWithPreload = useCallback(() => {
    openGo();
    queueMicrotask(() => preloadGoNavigationRouteChunks());
  }, [openGo]);

  const openFinanceGoWithPreload = useCallback(() => {
    openFinanceGo();
    queueMicrotask(() => preloadGoNavigationRouteChunks());
  }, [openFinanceGo]);

  const openCompose = useCallback(() => {
    setComposeAssigneeOverride(undefined);
    setComposeRelatedContactIdsOverride(undefined);
    setComposeOpen(true);
  }, [
    setComposeAssigneeOverride,
    setComposeRelatedContactIdsOverride,
    setComposeOpen,
  ]);

  useComposeShortcut({
    enabled: true,
    onCompose: openCompose,
  });

  useComposeGlobalShortcut({
    enabled: true,
    onCompose: openCompose,
  });

  useEffect(() => {
    function onOpenCompose(event: Event) {
      if (openRef.current) return;
      const detail =
        event instanceof CustomEvent
          ? (event.detail as {
              assigneeId?: string | null;
              relatedContactIds?: string[];
            } | null)
          : null;
      if (
        detail &&
        typeof detail === "object" &&
        Object.prototype.hasOwnProperty.call(detail, "assigneeId")
      ) {
        setComposeAssigneeOverride(detail.assigneeId ?? null);
      } else {
        setComposeAssigneeOverride(undefined);
      }
      if (
        detail &&
        typeof detail === "object" &&
        Array.isArray(detail.relatedContactIds)
      ) {
        setComposeRelatedContactIdsOverride(
          detail.relatedContactIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          ),
        );
      } else {
        setComposeRelatedContactIdsOverride(undefined);
      }
      setComposeOpen(true);
    }
    window.addEventListener("backsteros:open-compose", onOpenCompose);
    return () =>
      window.removeEventListener("backsteros:open-compose", onOpenCompose);
  }, [
    openRef,
    setComposeOpen,
    setComposeAssigneeOverride,
    setComposeRelatedContactIdsOverride,
  ]);

  useCommandPaletteGlobalShortcut({
    enabled: true,
    onOpenPalette: openSearch,
  });

  useNavigationShortcuts({
    enabled: true,
    openGo: openGoWithPreload,
    openFinanceGo: openFinanceGoWithPreload,
    closePalette,
    onNavigate: navigateTo,
  });

  useFinanceNavigationShortcuts({
    enabled: true,
    pathname: location.pathname,
    openFinanceGo: openFinanceGoWithPreload,
    closePalette,
    onNavigate: navigateTo,
  });

  useSettingsShortcut({
    enabled: true,
    closePalette,
    onNavigate: navigateTo,
  });

  useSectionTabShortcuts({
    enabled: true,
    pathname: location.pathname,
    search,
    onNavigate: navigateTo,
  });

  useListBoardViewShortcuts({
    enabled: true,
    pathname: location.pathname,
    search,
    onNavigate: navigateTo,
  });

  useTaskPropertyDropdownShortcuts({
    pathname: location.pathname,
  });

  useContentPreviewScrollShortcuts();
  useBlockBrowserTabFocus({ enabled: true });

  useEscapeBackNavigation({
    enabled: true,
    pathname: location.pathname,
    canGoBack: history.canGoBack,
    onGoBack: history.goBack,
  });

  useContentSidePanelToggleShortcut({
    enabled: showSidePanel,
    onToggle: toggleSidePanelCollapsed,
  });

  useDocumentTreeCreateFolderShortcut({
    pathname: panelPathname,
    enabled: true,
  });

  return null;
}
