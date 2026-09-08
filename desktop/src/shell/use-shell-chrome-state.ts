import { useCallback, useEffect, useRef, useState } from "react";
import { useShellLocation } from "../lib/shell-route-keep-alive";

import {
  CONTEXT_PANEL_COLLAPSE_DURATION_MS,
  SIDEBAR_COLLAPSE_DURATION_MS,
  shouldHandleGlobalShortcut,
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

export function useShellChromeState() {
  const [composeOpen, setComposeOpen] = useState(false);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [sidePanelAnimating, setSidePanelAnimating] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
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

  /** `[` — enable width transition for one paint, then flip collapsed. */
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarAnimating(true);
    if (sidebarAnimTimerRef.current != null) {
      window.clearTimeout(sidebarAnimTimerRef.current);
      sidebarAnimTimerRef.current = null;
    }
    if (sidebarAnimRafRef.current != null) {
      window.cancelAnimationFrame(sidebarAnimRafRef.current);
      sidebarAnimRafRef.current = null;
    }
    sidebarAnimRafRef.current = window.requestAnimationFrame(() => {
      sidebarAnimRafRef.current = window.requestAnimationFrame(() => {
        sidebarAnimRafRef.current = null;
        setSidebarCollapsed((current) => {
          const next = !current;
          localStorage.setItem("backsteros:sidebar-visible", String(!next));
          return next;
        });
        sidebarAnimTimerRef.current = window.setTimeout(() => {
          sidebarAnimTimerRef.current = null;
          setSidebarAnimating(false);
        }, SIDEBAR_COLLAPSE_DURATION_MS);
      });
    });
  }, []);

  /** ⇧[ — enable width transition for one paint, then flip collapsed. */
  const toggleSidePanelCollapsed = useCallback(() => {
    setSidePanelAnimating(true);
    if (sidePanelAnimTimerRef.current != null) {
      window.clearTimeout(sidePanelAnimTimerRef.current);
      sidePanelAnimTimerRef.current = null;
    }
    if (sidePanelAnimRafRef.current != null) {
      window.cancelAnimationFrame(sidePanelAnimRafRef.current);
      sidePanelAnimRafRef.current = null;
    }
    sidePanelAnimRafRef.current = window.requestAnimationFrame(() => {
      sidePanelAnimRafRef.current = window.requestAnimationFrame(() => {
        sidePanelAnimRafRef.current = null;
        setSidePanelCollapsed((current) => !current);
        sidePanelAnimTimerRef.current = window.setTimeout(() => {
          sidePanelAnimTimerRef.current = null;
          setSidePanelAnimating(false);
        }, CONTEXT_PANEL_COLLAPSE_DURATION_MS);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (sidePanelAnimTimerRef.current != null) {
        window.clearTimeout(sidePanelAnimTimerRef.current);
      }
      if (sidePanelAnimRafRef.current != null) {
        window.cancelAnimationFrame(sidePanelAnimRafRef.current);
      }
      if (sidebarAnimTimerRef.current != null) {
        window.clearTimeout(sidebarAnimTimerRef.current);
      }
      if (sidebarAnimRafRef.current != null) {
        window.cancelAnimationFrame(sidebarAnimRafRef.current);
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
    installSelectAllShortcutListeners();
    installClearSelectionShortcutListeners();
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

  return {
    composeOpen,
    setComposeOpen,
    sidePanelCollapsed,
    setSidePanelCollapsed,
    sidePanelAnimating,
    toggleSidePanelCollapsed,
    sidebarCollapsed,
    sidebarAnimating,
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
