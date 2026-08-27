import { useCallback, useEffect, useState } from "react";
import { useChromeShellLocation } from "../lib/shell-route-keep-alive";

import {
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const windowFullscreen = useTauriWindowFullscreen();
  const [defaultAssigneeId, setDefaultAssigneeIdState] = useState<string | null>(
    () => getDefaultAssigneeId(),
  );

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("backsteros:sidebar-visible", String(!next));
      return next;
    });
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
    sidebarCollapsed,
    windowFullscreen,
    defaultAssigneeId,
    setDefaultAssigneeIdState,
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
    if ("requestIdleCallback" in window) {
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
  showSidePanel,
  panelPathname,
  setSidePanelCollapsed,
}: {
  tabs: ReturnType<typeof useShellTabs>;
  setComposeOpen: (open: boolean) => void;
  showSidePanel: boolean;
  panelPathname: string;
  setSidePanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const location = useChromeShellLocation();
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

  useComposeShortcut({
    enabled: true,
    onCompose: () => setComposeOpen(true),
  });

  useComposeGlobalShortcut({
    enabled: true,
    onCompose: () => setComposeOpen(true),
  });

  useEffect(() => {
    function onOpenCompose() {
      if (openRef.current) return;
      setComposeOpen(true);
    }
    window.addEventListener("backsteros:open-compose", onOpenCompose);
    return () =>
      window.removeEventListener("backsteros:open-compose", onOpenCompose);
  }, [openRef, setComposeOpen]);

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
    onToggle: () => setSidePanelCollapsed((current) => !current),
  });

  useDocumentTreeCreateFolderShortcut({
    pathname: panelPathname,
    enabled: true,
  });

  return null;
}
