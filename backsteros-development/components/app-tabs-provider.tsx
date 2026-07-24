"use client";

import {
  createDefaultTabsState,
  createProductTab,
  normalizeTabHref,
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

type AppTabsContextValue = {
  tabs: ProductTab[];
  activeTabId: string;
  activeTab: ProductTab | undefined;
  hydrated: boolean;
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
): ProductTabsState {
  const normalized = normalizeTabHref(pathname);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab) {
    const tab = createProductTab(normalized, title);
    return { tabs: [tab], activeTabId: tab.id };
  }
  if (activeTab.href === normalized && activeTab.title === title) {
    return state;
  }
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? { ...tab, href: normalized, title }
        : tab,
    ),
  };
}

export function AppTabsProvider({
  children,
  pathname,
  tabTitle,
  newTabHref,
  newTabTitle,
  navigate,
}: {
  children: ReactNode;
  pathname: string;
  tabTitle: string;
  newTabHref: string;
  newTabTitle: string;
  navigate: (href: string) => void;
}) {
  const normalizedPath = normalizeTabHref(pathname);
  const [state, setState] = useState<ProductTabsState>(() =>
    createDefaultTabsState(normalizedPath),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredState(normalizedPath);
    setState(syncActiveTab(stored, normalizedPath, tabTitle));
    setHydrated(true);
    // Hydrate once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setState((current) => syncActiveTab(current, normalizedPath, tabTitle));
  }, [hydrated, normalizedPath, tabTitle]);

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

  const updateActiveTabTitle = useCallback((title: string) => {
    setState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, title } : tab,
      ),
    }));
  }, []);

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId),
    [state.activeTabId, state.tabs],
  );

  const value = useMemo(
    () => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      activeTab,
      hydrated,
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
