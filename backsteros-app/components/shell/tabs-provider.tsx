"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import { useMounted } from "@/hooks/use-mounted";
import { usePathname, useRouter } from "next/navigation";

import { createId } from "@/lib/create-id";
import { getTabTitleForHref, normalizeTabHref } from "@/lib/tabs/get-tab-title";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";
import type { AppTab, TabsState } from "@/lib/tabs/types";

const STORAGE_KEY = "backsteros.app-tabs";

type TabsContextValue = {
  tabs: AppTab[];
  activeTabId: string;
  activeTab: AppTab | undefined;
  closeTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  activatePreviousTab: () => void;
  activateNextTab: () => void;
  updateActiveTabTitle: (title: string) => void;
  updateTabIconForHref: (href: string, icon: string | null) => void;
  openNewTab: () => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

const mobileTabsFallback: TabsContextValue = {
  tabs: [],
  activeTabId: "",
  activeTab: undefined,
  closeTab: () => {},
  activateTab: () => {},
  activatePreviousTab: () => {},
  activateNextTab: () => {},
  updateActiveTabTitle: () => {},
  updateTabIconForHref: () => {},
  openNewTab: () => {},
};

function createTab(href: string, title?: string): AppTab {
  return {
    id: createId(),
    href: normalizeTabHref(href),
    title: title ?? getTabTitleForHref(href),
  };
}

function createDefaultState(pathname: string): TabsState {
  const tab = createTab(pathname);
  return { tabs: [tab], activeTabId: tab.id };
}

function loadStoredState(): TabsState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TabsState;
    if (!parsed.tabs?.length || !parsed.activeTabId) {
      return null;
    }

    return {
      tabs: parsed.tabs.map((tab) => ({
        ...tab,
        href: normalizeTabHref(tab.href),
      })),
      activeTabId: parsed.activeTabId,
    };
  } catch {
    return null;
  }
}

function persistState(state: TabsState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncActiveTabToPath(state: TabsState, pathname: string): TabsState {
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab || activeTab.href === pathname) {
    return state;
  }

  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? {
            ...tab,
            href: pathname,
            title: getTabTitleForHref(pathname),
            icon: undefined,
          }
        : tab,
    ),
  };
}

type TabsProviderProps = {
  children: ReactNode;
};

export function TabsProvider({ children }: TabsProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const normalizedPath = normalizeTabHref(pathname);
  const [state, setState] = useState<TabsState>(() =>
    createDefaultState(normalizedPath),
  );
  const mounted = useMounted();
  const [hydrated, setHydrated] = useState(false);
  const [prevNormalizedPath, setPrevNormalizedPath] = useState(normalizedPath);
  const stateRef = useLatestRef(state);

  if (mounted && !hydrated) {
    setHydrated(true);
    const stored = loadStoredState();
    const next = syncActiveTabToPath(
      stored ?? createDefaultState(normalizedPath),
      normalizedPath,
    );
    setState(next);
    setPrevNormalizedPath(normalizedPath);
  }

  if (hydrated && normalizedPath !== prevNormalizedPath) {
    setPrevNormalizedPath(normalizedPath);
    setState((current) => syncActiveTabToPath(current, normalizedPath));
  }

  useEffect(() => {
    if (!hydrated) return;
    persistState(state);
  }, [hydrated, state]);

  const activateTab = useCallback(
    (tabId: string) => {
      const current = stateRef.current;
      const tab = current.tabs.find((item) => item.id === tabId);
      if (!tab || current.activeTabId === tabId) return;

      setState({ ...current, activeTabId: tabId });

      if (tab.href !== normalizedPath) {
        router.push(tab.href);
      }
    },
    [router, normalizedPath, stateRef],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const current = stateRef.current;
      if (current.tabs.length <= 1) return;

      const index = current.tabs.findIndex((tab) => tab.id === tabId);
      if (index === -1) return;

      const tabs = current.tabs.filter((tab) => tab.id !== tabId);
      const closingActive = current.activeTabId === tabId;

      if (!closingActive) {
        setState({ ...current, tabs });
        return;
      }

      const nextTab = tabs[Math.min(index, tabs.length - 1)]!;
      setState({ tabs, activeTabId: nextTab.id });

      if (nextTab.href !== normalizedPath) {
        router.push(nextTab.href);
      }
    },
    [router, normalizedPath, stateRef],
  );

  const updateActiveTabTitle = useCallback((title: string) => {
    setState((current) => {
      return {
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === current.activeTabId ? { ...tab, title } : tab,
        ),
      };
    });
  }, []);

  const updateTabIconForHref = useCallback(
    (href: string, icon: string | null) => {
      const normalizedHref = normalizeTabHref(href);

      setState((current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.href === normalizedHref ? { ...tab, icon } : tab,
        ),
      }));
    },
    [],
  );

  const openNewTab = useCallback(() => {
    const tab = createTab("/inbox");

    setState((current) => ({
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
    }));

    if (normalizedPath !== "/inbox") {
      router.push("/inbox");
    }
  }, [router, normalizedPath]);

  const activatePreviousTab = useCallback(() => {
    const current = stateRef.current;
    const index = current.tabs.findIndex(
      (tab) => tab.id === current.activeTabId,
    );
    if (index <= 0) {
      return;
    }

    activateTab(current.tabs[index - 1]!.id);
  }, [activateTab, stateRef]);

  const activateNextTab = useCallback(() => {
    const current = stateRef.current;
    const index = current.tabs.findIndex(
      (tab) => tab.id === current.activeTabId,
    );
    if (index === -1 || index >= current.tabs.length - 1) {
      return;
    }

    activateTab(current.tabs[index + 1]!.id);
  }, [activateTab, stateRef]);

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId),
    [state.activeTabId, state.tabs],
  );

  const value = useMemo(
    () => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      activeTab,
      closeTab,
      activateTab,
      activatePreviousTab,
      activateNextTab,
      updateActiveTabTitle,
      updateTabIconForHref,
      openNewTab,
    }),
    [
      state.tabs,
      state.activeTabId,
      activeTab,
      closeTab,
      activateTab,
      activatePreviousTab,
      activateNextTab,
      updateActiveTabTitle,
      updateTabIconForHref,
      openNewTab,
    ],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    if (isMobileShellBuildActive()) {
      return mobileTabsFallback;
    }
    throw new Error("useTabs must be used within TabsProvider");
  }
  return context;
}
