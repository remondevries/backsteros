"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  LEGACY_NAVIGATION_STORAGE_KEYS,
  NAVIGATION_HISTORY_STORAGE_KEY,
} from "@/lib/navigation-history/constants";
import {
  applyPathnameChangeForTab,
  areHistoryStoresEqual,
  createEmptyHistoryStore,
  createInitialHistoryStore,
  getActiveStack,
  getRecentHistoryPagesFromStore,
  historyEntryHrefsMatch,
  migrateLegacyStore,
  pruneStacks,
  resolveHistoryEntryTitle,
  setActiveStack,
  syncTabStackToHref,
} from "@/lib/navigation-history/history-engine";
import type {
  NavigationHistoryEntry,
  NavigationHistoryState,
  NavigationHistoryStore,
} from "@/lib/navigation-history/types";
import type { TaskStatus } from "@/lib/task-status";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";
import { buildCurrentLocationHref } from "@/lib/navigation-trail/path-utils";
import { stripReturnToParam } from "@/lib/navigation-trail/return-to";
import { normalizeTabHref } from "@/lib/tabs/get-tab-title";
import { useTabs } from "@/components/shell/tabs-provider";

type NavigationHistoryContextValue = {
  canGoBack: boolean;
  canGoForward: boolean;
  recentPages: NavigationHistoryEntry[];
  goBack: () => void;
  goForward: () => void;
  navigateToHistoryEntry: (href: string) => void;
  registerPageTitle: (href: string, title: string) => void;
  registerPageIcon: (href: string, icon: string | null) => void;
  registerPageTaskStatus: (href: string, status: TaskStatus) => void;
};

const NavigationHistoryContext =
  createContext<NavigationHistoryContextValue | null>(null);

const mobileNavigationHistoryFallback: NavigationHistoryContextValue = {
  canGoBack: false,
  canGoForward: false,
  recentPages: [],
  goBack: () => {},
  goForward: () => {},
  navigateToHistoryEntry: () => {},
  registerPageTitle: () => {},
  registerPageIcon: () => {},
  registerPageTaskStatus: () => {},
};

function readCurrentSearchParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

function clearLegacyNavigationStorageKeys() {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of LEGACY_NAVIGATION_STORAGE_KEYS) {
    window.sessionStorage.removeItem(key);
  }
}

function loadStoredHistoryStore(
  activeTabId: string,
): NavigationHistoryStore | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(NAVIGATION_HISTORY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return migrateLegacyStore(JSON.parse(raw), activeTabId);
  } catch {
    return null;
  }
}

function persistHistoryStore(store: NavigationHistoryStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    NAVIGATION_HISTORY_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function updateEntriesMatchingHref(
  stack: NavigationHistoryState,
  href: string,
  update: (
    entry: NavigationHistoryState["entries"][number],
  ) => NavigationHistoryState["entries"][number],
): NavigationHistoryState | null {
  let changed = false;
  const nextEntries = stack.entries.map((entry) => {
    if (!historyEntryHrefsMatch(entry.href, href)) {
      return entry;
    }
    const next = update(entry);
    if (next !== entry) {
      changed = true;
    }
    return next;
  });

  if (!changed) {
    return null;
  }

  return { ...stack, entries: nextEntries };
}

type NavigationHistoryProviderProps = {
  children: ReactNode;
};

export function NavigationHistoryProvider({
  children,
}: NavigationHistoryProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeTabId, activeTab, tabs, hydrated: tabsHydrated } = useTabs();
  const activeTabHref = activeTab?.href ?? pathname;
  const tabIdsKey = tabs.map((tab) => tab.id).join("\0");

  const [store, setStore] = useState<NavigationHistoryStore>(() =>
    createEmptyHistoryStore(),
  );
  const [historyReady, setHistoryReady] = useState(false);
  const pageTitlesRef = useRef(new Map<string, string>());
  const pendingIndexRef = useRef<number | null>(null);
  const pendingTabSwitchRef = useRef(false);
  const hydratedRef = useRef(false);
  const activeTabIdRef = useRef(activeTabId);
  const storeRef = useRef(store);
  const prevActiveTabIdRef = useRef(activeTabId);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Wait for tabs to restore from localStorage so stacks key under real tab ids.
  useEffect(() => {
    if (!tabsHydrated || hydratedRef.current) {
      return;
    }

    clearLegacyNavigationStorageKeys();

    if (!activeTabId) {
      hydratedRef.current = true;
      setHistoryReady(true);
      return;
    }

    const searchParams = readCurrentSearchParams();
    const currentHref = buildCurrentLocationHref(
      pathname,
      stripReturnToParam(searchParams),
    );
    const title = resolveHistoryEntryTitle(currentHref, pageTitlesRef.current);
    const stored = loadStoredHistoryStore(activeTabId);
    let next =
      stored ?? createInitialHistoryStore(activeTabId, currentHref, title);
    next = applyPathnameChangeForTab(
      next,
      activeTabId,
      currentHref,
      title,
      null,
    );
    next = pruneStacks(
      next,
      tabs.length > 0 ? tabs.map((tab) => tab.id) : [activeTabId],
    );

    setStore(next);
    persistHistoryStore(next);
    prevActiveTabIdRef.current = activeTabId;
    hydratedRef.current = true;
    setHistoryReady(true);
  }, [tabsHydrated, activeTabId, pathname, tabs]);

  useEffect(() => {
    if (!hydratedRef.current || !activeTabId) {
      return;
    }

    if (prevActiveTabIdRef.current !== activeTabId) {
      prevActiveTabIdRef.current = activeTabId;
      pendingTabSwitchRef.current = true;
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    const ids = tabIdsKey.length > 0 ? tabIdsKey.split("\0") : [];

    setStore((current) => {
      const next = pruneStacks(current, ids);
      if (areHistoryStoresEqual(current, next)) {
        return current;
      }
      persistHistoryStore(next);
      return next;
    });
  }, [tabIdsKey]);

  useEffect(() => {
    if (!hydratedRef.current || !activeTabId) {
      return;
    }

    const searchParams = readCurrentSearchParams();
    const currentHref = buildCurrentLocationHref(
      pathname,
      stripReturnToParam(searchParams),
    );
    const title = resolveHistoryEntryTitle(currentHref, pageTitlesRef.current);
    const pendingIndex = pendingIndexRef.current;
    pendingIndexRef.current = null;

    const locationMatchesTab =
      normalizeTabHref(currentHref) === normalizeTabHref(activeTabHref);
    const isTabSwitch = pendingTabSwitchRef.current;

    if (isTabSwitch && !locationMatchesTab) {
      return;
    }

    if (isTabSwitch) {
      pendingTabSwitchRef.current = false;
    }

    setStore((current) => {
      const next = isTabSwitch
        ? syncTabStackToHref(current, activeTabId, currentHref, title)
        : applyPathnameChangeForTab(
            current,
            activeTabId,
            currentHref,
            title,
            pendingIndex,
          );

      if (areHistoryStoresEqual(current, next)) {
        return current;
      }

      persistHistoryStore(next);
      return next;
    });
  }, [pathname, activeTabId, activeTabHref]);

  const registerPageTitle = useCallback((href: string, title: string) => {
    const normalized = normalizeTabHref(href);
    pageTitlesRef.current.set(normalized, title);

    setStore((current) => {
      let next = current;
      let changed = false;

      for (const [tabId, stack] of Object.entries(current.stacksByTabId)) {
        const updated = updateEntriesMatchingHref(stack, href, (entry) => {
          if (entry.title === title) {
            return entry;
          }
          return { ...entry, title };
        });
        if (updated) {
          changed = true;
          next = setActiveStack(next, tabId, updated);
        }
      }

      if (!changed) {
        return current;
      }

      persistHistoryStore(next);
      return next;
    });
  }, []);

  const registerPageIcon = useCallback((href: string, icon: string | null) => {
    setStore((current) => {
      let next = current;
      let changed = false;

      for (const [tabId, stack] of Object.entries(current.stacksByTabId)) {
        const updated = updateEntriesMatchingHref(stack, href, (entry) => {
          if (entry.icon === icon) {
            return entry;
          }
          return { ...entry, icon };
        });
        if (updated) {
          changed = true;
          next = setActiveStack(next, tabId, updated);
        }
      }

      if (!changed) {
        return current;
      }

      persistHistoryStore(next);
      return next;
    });
  }, []);

  const registerPageTaskStatus = useCallback(
    (href: string, taskStatus: TaskStatus) => {
      setStore((current) => {
        let next = current;
        let changed = false;

        for (const [tabId, stack] of Object.entries(current.stacksByTabId)) {
          const updated = updateEntriesMatchingHref(stack, href, (entry) => {
            if (entry.taskStatus === taskStatus) {
              return entry;
            }
            return { ...entry, taskStatus };
          });
          if (updated) {
            changed = true;
            next = setActiveStack(next, tabId, updated);
          }
        }

        if (!changed) {
          return current;
        }

        persistHistoryStore(next);
        return next;
      });
    },
    [],
  );

  const goToIndex = useCallback(
    (index: number) => {
      const stack = getActiveStack(storeRef.current, activeTabIdRef.current);
      const entry = stack?.entries[index];
      if (!entry) {
        return;
      }

      pendingIndexRef.current = index;
      router.push(entry.href);
    },
    [router],
  );

  const goBack = useCallback(() => {
    const stack = getActiveStack(storeRef.current, activeTabIdRef.current);
    if (!stack || stack.index <= 0) {
      return;
    }

    goToIndex(stack.index - 1);
  }, [goToIndex]);

  const goForward = useCallback(() => {
    const stack = getActiveStack(storeRef.current, activeTabIdRef.current);
    if (!stack || stack.index >= stack.entries.length - 1) {
      return;
    }

    goToIndex(stack.index + 1);
  }, [goToIndex]);

  const navigateToHistoryEntry = useCallback(
    (href: string) => {
      // Recent pages are global; always push into the active tab.
      router.push(href);
    },
    [router],
  );

  const activeStack = activeTabId
    ? getActiveStack(store, activeTabId)
    : null;
  const currentHref = activeStack?.entries[activeStack.index]?.href;

  const value = useMemo(
    () => ({
      canGoBack: historyReady && (activeStack?.index ?? 0) > 0,
      canGoForward:
        historyReady &&
        activeStack !== null &&
        activeStack.index < activeStack.entries.length - 1,
      recentPages: historyReady
        ? getRecentHistoryPagesFromStore(store, currentHref)
        : [],
      goBack,
      goForward,
      navigateToHistoryEntry,
      registerPageTitle,
      registerPageIcon,
      registerPageTaskStatus,
    }),
    [
      activeStack,
      currentHref,
      goBack,
      goForward,
      navigateToHistoryEntry,
      registerPageTitle,
      registerPageIcon,
      registerPageTaskStatus,
      historyReady,
      store,
    ],
  );

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext);
  if (!context) {
    if (isMobileShellBuildActive()) {
      return mobileNavigationHistoryFallback;
    }
    throw new Error(
      "useNavigationHistory must be used within NavigationHistoryProvider",
    );
  }
  return context;
}
