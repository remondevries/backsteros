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
  applyPathnameChange,
  areHistoryStatesEqual,
  createInitialHistoryState,
  getRecentHistoryPages,
  historyEntryHrefsMatch,
  resolveHistoryEntryTitle,
} from "@/lib/navigation-history/history-engine";
import type {
  NavigationHistoryEntry,
  NavigationHistoryState,
} from "@/lib/navigation-history/types";
import type { TaskStatus } from "@/lib/task-status";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";
import { buildCurrentLocationHref } from "@/lib/navigation-trail/path-utils";
import { stripReturnToParam } from "@/lib/navigation-trail/return-to";
import { normalizeTabHref } from "@/lib/tabs/get-tab-title";

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

function loadStoredHistoryState(): NavigationHistoryState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(NAVIGATION_HISTORY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as NavigationHistoryState;
    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
      return null;
    }

    const index =
      typeof parsed.index === "number"
        ? Math.min(Math.max(parsed.index, 0), parsed.entries.length - 1)
        : parsed.entries.length - 1;

    return { entries: parsed.entries, index };
  } catch {
    return null;
  }
}

function persistHistoryState(state: NavigationHistoryState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    NAVIGATION_HISTORY_STORAGE_KEY,
    JSON.stringify(state),
  );
}

type NavigationHistoryProviderProps = {
  children: ReactNode;
};

export function NavigationHistoryProvider({
  children,
}: NavigationHistoryProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<NavigationHistoryState>(() =>
    createInitialHistoryState(pathname, resolveHistoryEntryTitle(pathname, new Map())),
  );
  const [historyReady, setHistoryReady] = useState(false);
  const pageTitlesRef = useRef(new Map<string, string>());
  const pendingIndexRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);
  const initialPathnameRef = useRef(pathname);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    clearLegacyNavigationStorageKeys();

    const initialPathname = initialPathnameRef.current;
    const searchParams = readCurrentSearchParams();
    const currentHref = buildCurrentLocationHref(
      initialPathname,
      stripReturnToParam(searchParams),
    );
    const title = resolveHistoryEntryTitle(currentHref, pageTitlesRef.current);
    const stored = loadStoredHistoryState();
    const next = stored
      ? applyPathnameChange(stored, currentHref, title, null)
      : createInitialHistoryState(currentHref, title);

    setState(next);
    persistHistoryState(next);
    hydratedRef.current = true;
    setHistoryReady(true);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
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

    setState((current) => {
      const next = applyPathnameChange(
        current,
        currentHref,
        title,
        pendingIndex,
      );

      if (areHistoryStatesEqual(current, next)) {
        return current;
      }

      persistHistoryState(next);
      return next;
    });
  }, [pathname]);

  const registerPageTitle = useCallback((href: string, title: string) => {
    const normalized = normalizeTabHref(href);
    pageTitlesRef.current.set(normalized, title);

    setState((current) => {
      const index = current.entries.findIndex((entry) => {
        const [path] = entry.href.split(/[?#]/);
        return normalizeTabHref(path ?? "/") === normalized;
      });

      if (index === -1) {
        return current;
      }

      const nextEntries = current.entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, title } : entry,
      );

      const next = { ...current, entries: nextEntries };
      persistHistoryState(next);
      return next;
    });
  }, []);

  const registerPageIcon = useCallback((href: string, icon: string | null) => {
    setState((current) => {
      let changed = false;

      const nextEntries = current.entries.map((entry) => {
        if (!historyEntryHrefsMatch(entry.href, href)) {
          return entry;
        }

        if (entry.icon === icon) {
          return entry;
        }

        changed = true;
        return { ...entry, icon };
      });

      if (!changed) {
        return current;
      }

      const next = { ...current, entries: nextEntries };
      persistHistoryState(next);
      return next;
    });
  }, []);

  const registerPageTaskStatus = useCallback(
    (href: string, taskStatus: TaskStatus) => {
      const normalized = normalizeTabHref(href);

      setState((current) => {
        const index = current.entries.findIndex((entry) => {
          const [path] = entry.href.split(/[?#]/);
          return normalizeTabHref(path ?? "/") === normalized;
        });

        if (index === -1) {
          return current;
        }

        const nextEntries = current.entries.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, taskStatus } : entry,
        );

        const next = { ...current, entries: nextEntries };
        persistHistoryState(next);
        return next;
      });
    },
    [],
  );

  const goToIndex = useCallback(
    (index: number) => {
      const entry = stateRef.current.entries[index];
      if (!entry) {
        return;
      }

      pendingIndexRef.current = index;
      router.push(entry.href);
    },
    [router],
  );

  const goBack = useCallback(() => {
    if (stateRef.current.index <= 0) {
      return;
    }

    goToIndex(stateRef.current.index - 1);
  }, [goToIndex]);

  const goForward = useCallback(() => {
    if (stateRef.current.index >= stateRef.current.entries.length - 1) {
      return;
    }

    goToIndex(stateRef.current.index + 1);
  }, [goToIndex]);

  const navigateToHistoryEntry = useCallback(
    (href: string) => {
      const index = stateRef.current.entries.findIndex(
        (entry) => entry.href === href,
      );
      if (index === -1) {
        router.push(href);
        return;
      }

      goToIndex(index);
    },
    [goToIndex, router],
  );

  const value = useMemo(
    () => ({
      // Gate on historyReady only (set in useEffect). Do not also gate on
      // useMounted — that snapshot can differ across SSR/hydration and flip
      // `disabled` on the back/forward buttons.
      canGoBack: historyReady && state.index > 0,
      canGoForward:
        historyReady && state.index < state.entries.length - 1,
      recentPages: historyReady ? getRecentHistoryPages(state) : [],
      goBack,
      goForward,
      navigateToHistoryEntry,
      registerPageTitle,
      registerPageIcon,
      registerPageTaskStatus,
    }),
    [
      goBack,
      goForward,
      navigateToHistoryEntry,
      registerPageTitle,
      registerPageIcon,
      registerPageTaskStatus,
      historyReady,
      state,
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
