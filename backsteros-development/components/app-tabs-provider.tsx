"use client";

import {
  createDefaultTabsState,
  createProductTab,
  isBlockingModalOpen,
  isTargetInsideBlockingModal,
  normalizeTabHref,
  shouldHandleGlobalShortcut,
  useTabShortcuts,
  type ProductTab,
  type ProductTabsState,
} from "@backsteros/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "backsteros.development.app-tabs";

export type ConsoleTabTaskMeta = {
  taskId?: string | null;
  taskStatus?: string | null;
};

type AppTabsContextValue = {
  tabs: ProductTab[];
  activeTabId: string;
  activeTab: ProductTab | undefined;
  hydrated: boolean;
  workingTaskIds: ReadonlySet<string>;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openNewTab: () => void;
  updateActiveTabTitle: (title: string) => void;
};

const AppTabsContext = createContext<AppTabsContextValue | null>(null);

function loadStoredState(pathname: string): ProductTabsState {
  if (typeof window === "undefined") {
    return createDefaultTabsState(pathname);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultTabsState(pathname);
    const parsed = JSON.parse(raw) as ProductTabsState;
    if (!parsed.tabs?.length || !parsed.activeTabId) {
      return createDefaultTabsState(pathname);
    }
    return {
      tabs: parsed.tabs.map((tab) => ({
        ...tab,
        href: normalizeTabHref(tab.href),
      })),
      activeTabId: parsed.activeTabId,
    };
  } catch {
    return createDefaultTabsState(pathname);
  }
}

function syncActiveTab(
  state: ProductTabsState,
  pathname: string,
  title: string,
  taskMeta: ConsoleTabTaskMeta = {},
): ProductTabsState {
  const normalized = normalizeTabHref(pathname);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const nextTaskId = taskMeta.taskId ?? null;
  const nextTaskStatus = taskMeta.taskStatus ?? null;
  if (!activeTab) {
    const tab = createProductTab(normalized, title);
    return {
      tabs: [
        {
          ...tab,
          taskId: nextTaskId,
          taskStatus: nextTaskStatus,
        },
      ],
      activeTabId: tab.id,
    };
  }
  if (
    activeTab.href === normalized &&
    activeTab.title === title &&
    (activeTab.taskId ?? null) === nextTaskId &&
    (activeTab.taskStatus ?? null) === nextTaskStatus
  ) {
    return state;
  }
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? {
            ...tab,
            href: normalized,
            title,
            taskId: nextTaskId,
            taskStatus: nextTaskStatus,
          }
        : tab,
    ),
  };
}

/** Allow ⌘T / ⌘⇧[ / ] while the embedded terminal is focused. */
function shouldHandleConsoleTabShortcut(event: KeyboardEvent): boolean {
  const target = event.target;
  const inXterm =
    target instanceof HTMLElement && Boolean(target.closest(".xterm"));
  if (inXterm) {
    return !(
      isBlockingModalOpen() && !isTargetInsideBlockingModal(event.target)
    );
  }
  return shouldHandleGlobalShortcut(event);
}

export function AppTabsProvider({
  children,
  pathname,
  tabTitle,
  tabTaskMeta,
  newTabHref,
  newTabTitle,
  navigate,
  workingTaskIds = [],
  shortcutsEnabled = true,
}: {
  children: ReactNode;
  pathname: string;
  tabTitle: string;
  tabTaskMeta?: ConsoleTabTaskMeta;
  newTabHref: string;
  newTabTitle: string;
  navigate: (href: string) => void;
  workingTaskIds?: readonly string[];
  /** When false, file editor tabs own ⌘T / ⌘⇧[ / ⌘⇧] / ⌘W. */
  shortcutsEnabled?: boolean;
}) {
  const normalizedPath = normalizeTabHref(pathname);
  const taskMeta = tabTaskMeta ?? {};
  const [state, setState] = useState<ProductTabsState>(() =>
    createDefaultTabsState(normalizedPath),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredState(normalizedPath);
    setState(syncActiveTab(stored, normalizedPath, tabTitle, taskMeta));
    setHydrated(true);
    // Hydrate once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setState((current) =>
      syncActiveTab(current, normalizedPath, tabTitle, taskMeta),
    );
  }, [
    hydrated,
    normalizedPath,
    tabTitle,
    taskMeta.taskId,
    taskMeta.taskStatus,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [hydrated, state]);

  const activateTab = useCallback(
    (tabId: string) => {
      setState((current) => {
        const tab = current.tabs.find((entry) => entry.id === tabId);
        if (!tab || current.activeTabId === tabId) {
          return current;
        }
        if (tab.href !== normalizedPath) {
          queueMicrotask(() => navigate(tab.href));
        }
        return { ...current, activeTabId: tabId };
      });
    },
    [navigate, normalizedPath],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setState((current) => {
        if (current.tabs.length <= 1) return current;
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) return current;
        const tabs = current.tabs.filter((tab) => tab.id !== tabId);
        const closingActive = current.activeTabId === tabId;
        if (!closingActive) {
          return { ...current, tabs };
        }
        const nextTab = tabs[Math.min(index, tabs.length - 1)]!;
        if (nextTab.href !== normalizedPath) {
          queueMicrotask(() => navigate(nextTab.href));
        }
        return { tabs, activeTabId: nextTab.id };
      });
    },
    [navigate, normalizedPath],
  );

  const openNewTab = useCallback(() => {
    const href = normalizeTabHref(newTabHref);
    const tab = createProductTab(href, newTabTitle);
    setState((current) => ({
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
    }));
    if (href !== normalizedPath) {
      navigate(href);
    }
  }, [navigate, newTabHref, newTabTitle, normalizedPath]);

  const activatePreviousTab = useCallback(() => {
    setState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const previous =
        current.tabs[(index - 1 + current.tabs.length) % current.tabs.length]!;
      if (previous.href !== normalizedPath) {
        queueMicrotask(() => navigate(previous.href));
      }
      return { ...current, activeTabId: previous.id };
    });
  }, [navigate, normalizedPath]);

  const activateNextTab = useCallback(() => {
    setState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const next = current.tabs[(index + 1) % current.tabs.length]!;
      if (next.href !== normalizedPath) {
        queueMicrotask(() => navigate(next.href));
      }
      return { ...current, activeTabId: next.id };
    });
  }, [navigate, normalizedPath]);

  const updateActiveTabTitle = useCallback((title: string) => {
    setState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, title } : tab,
      ),
    }));
  }, []);

  useTabShortcuts({
    enabled: shortcutsEnabled,
    activeTabId: state.activeTabId,
    openNewTab,
    closeTab,
    activatePreviousTab,
    activateNextTab,
    shouldHandle: shouldHandleConsoleTabShortcut,
  });

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId),
    [state.activeTabId, state.tabs],
  );

  const workingTaskIdSet = useMemo(
    () => new Set(workingTaskIds),
    [workingTaskIds],
  );

  const value = useMemo(
    () => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      activeTab,
      hydrated,
      workingTaskIds: workingTaskIdSet,
      activateTab,
      closeTab,
      openNewTab,
      updateActiveTabTitle,
    }),
    [
      state.tabs,
      state.activeTabId,
      activeTab,
      hydrated,
      workingTaskIdSet,
      activateTab,
      closeTab,
      openNewTab,
      updateActiveTabTitle,
    ],
  );

  return (
    <AppTabsContext.Provider value={value}>{children}</AppTabsContext.Provider>
  );
}

export function useAppTabs() {
  const context = useContext(AppTabsContext);
  if (!context) {
    throw new Error("useAppTabs must be used within AppTabsProvider");
  }
  return context;
}
