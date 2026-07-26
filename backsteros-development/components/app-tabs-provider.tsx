"use client";

import {
  createDefaultTabsState,
  createProductTab,
  isBlockingModalOpen,
  isTargetInsideBlockingModal,
  normalizeTabHref,
  useTabShortcuts,
  type ProductTab,
  type ProductTabsState,
} from "@backsteros/ui";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "backsteros.development.app-tabs";
/** How many closed tabs ⌘⇧T can walk back through. */
const MAX_CLOSED_TABS = 25;

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

/**
 * App-tab chrome (⌘T / ⌘W / ⌘⇧T / ⌘⇧[]) behaves like a browser: works from
 * terminals and editors. Only yield when a blocking modal owns the UI.
 */
function shouldHandleConsoleTabShortcut(event: KeyboardEvent): boolean {
  return !(
    isBlockingModalOpen() && !isTargetInsideBlockingModal(event.target)
  );
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
  /** Most-recently closed first — ⌘⇧T pops from the front. */
  const closedTabsRef = useRef<ProductTab[]>([]);
  /** Mirror of `state` so close/reopen can read tabs without racing setState. */
  const stateRef = useRef(state);
  stateRef.current = state;

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
    // Defer so tab switches are not blocked on synchronous localStorage I/O.
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, state]);

  const activateTab = useCallback(
    (tabId: string) => {
      const current = stateRef.current;
      const tab = current.tabs.find((entry) => entry.id === tabId);
      if (!tab || current.activeTabId === tabId) return;
      const nextState = { ...current, activeTabId: tabId };
      stateRef.current = nextState;
      // Urgent: tab chrome. Defer route/content work so the active tab paints first.
      setState(nextState);
      if (tab.href !== normalizedPath) {
        startTransition(() => {
          navigate(tab.href);
        });
      }
    },
    [navigate, normalizedPath],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const current = stateRef.current;
      if (current.tabs.length <= 1) return;
      const index = current.tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;
      const closed = current.tabs[index]!;
      const tabs = current.tabs.filter((tab) => tab.id !== tabId);
      const closingActive = current.activeTabId === tabId;
      const nextTab = closingActive
        ? tabs[Math.min(index, tabs.length - 1)]!
        : undefined;

      closedTabsRef.current = [closed, ...closedTabsRef.current].slice(
        0,
        MAX_CLOSED_TABS,
      );

      const nextState: ProductTabsState = {
        tabs,
        activeTabId: closingActive ? nextTab!.id : current.activeTabId,
      };
      stateRef.current = nextState;
      setState(nextState);
      if (nextTab && nextTab.href !== normalizedPath) {
        startTransition(() => {
          navigate(nextTab.href);
        });
      }
    },
    [navigate, normalizedPath],
  );

  const openNewTab = useCallback(() => {
    const href = normalizeTabHref(newTabHref);
    const tab = createProductTab(href, newTabTitle);
    const nextState = {
      tabs: [...stateRef.current.tabs, tab],
      activeTabId: tab.id,
    };
    stateRef.current = nextState;
    setState(nextState);
    if (href !== normalizedPath) {
      startTransition(() => {
        navigate(href);
      });
    }
  }, [navigate, newTabHref, newTabTitle, normalizedPath]);

  const activatePreviousTab = useCallback(() => {
    const current = stateRef.current;
    if (current.tabs.length <= 1) return;
    const index = current.tabs.findIndex(
      (tab) => tab.id === current.activeTabId,
    );
    if (index < 0) return;
    const previous =
      current.tabs[(index - 1 + current.tabs.length) % current.tabs.length]!;
    const nextState = { ...current, activeTabId: previous.id };
    stateRef.current = nextState;
    setState(nextState);
    if (previous.href !== normalizedPath) {
      startTransition(() => {
        navigate(previous.href);
      });
    }
  }, [navigate, normalizedPath]);

  const activateNextTab = useCallback(() => {
    const current = stateRef.current;
    if (current.tabs.length <= 1) return;
    const index = current.tabs.findIndex(
      (tab) => tab.id === current.activeTabId,
    );
    if (index < 0) return;
    const next = current.tabs[(index + 1) % current.tabs.length]!;
    const nextState = { ...current, activeTabId: next.id };
    stateRef.current = nextState;
    setState(nextState);
    if (next.href !== normalizedPath) {
      startTransition(() => {
        navigate(next.href);
      });
    }
  }, [navigate, normalizedPath]);

  const updateActiveTabTitle = useCallback((title: string) => {
    setState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, title } : tab,
      ),
    }));
  }, []);

  const reopenClosedTab = useCallback((): boolean => {
    const closed = closedTabsRef.current[0];
    if (!closed) return false;
    closedTabsRef.current = closedTabsRef.current.slice(1);
    const tab: ProductTab = {
      ...createProductTab(closed.href, closed.title),
      icon: closed.icon,
      taskId: closed.taskId ?? null,
      taskStatus: closed.taskStatus ?? null,
    };
    const nextState: ProductTabsState = {
      tabs: [...stateRef.current.tabs, tab],
      activeTabId: tab.id,
    };
    stateRef.current = nextState;
    setState(nextState);
    if (tab.href !== normalizedPath) {
      navigate(tab.href);
    }
    return true;
  }, [navigate, normalizedPath]);

  useTabShortcuts({
    enabled: shortcutsEnabled,
    activeTabId: state.activeTabId,
    openNewTab,
    closeTab,
    activatePreviousTab,
    activateNextTab,
    reopenClosedTab,
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
