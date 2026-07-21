"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeTabHref } from "../tabs.js";
import { NAVIGATION_HISTORY_STORAGE_KEY } from "./constants.js";
import {
  applyPathnameChangeForTab,
  areHistoryStoresEqual,
  createEmptyHistoryStore,
  createInitialHistoryStore,
  getActiveStack,
  getRecentHistoryPagesFromStore,
  migrateLegacyStore,
  pruneStacks,
  resolveHistoryEntryTitle,
  setActiveStack,
  syncTabStackToHref,
} from "./history-engine.js";
import type {
  NavigationHistoryState,
  NavigationHistoryStore,
} from "./types.js";

export type NavigationHistoryRecentPage = {
  href: string;
  title: string;
  visitedAt: number;
  icon?: string | null;
};

export type UseNavigationHistoryResult = {
  canGoBack: boolean;
  canGoForward: boolean;
  recentPages: NavigationHistoryRecentPage[];
  goBack: () => void;
  goForward: () => void;
  navigateToHistoryEntry: (href: string) => void;
  registerPageTitle: (href: string, title: string) => void;
  registerPageIcon: (href: string, icon: string | null) => void;
};

function buildHref(pathname: string, search: string): string {
  if (!search) {
    return pathname;
  }
  const prefixed = search.startsWith("?") ? search : `?${search}`;
  return `${pathname}${prefixed}`;
}

function pathOnly(href: string): string {
  const [path] = href.split(/[?#]/);
  return normalizeTabHref(path ?? "/");
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
  const normalized = normalizeTabHref(href);
  let changed = false;
  const nextEntries = stack.entries.map((entry) => {
    const [path] = entry.href.split(/[?#]/);
    if (normalizeTabHref(path ?? "/") !== normalized) {
      return entry;
    }
    changed = true;
    return update(entry);
  });

  if (!changed) {
    return null;
  }

  return { ...stack, entries: nextEntries };
}

/**
 * Framework-agnostic in-app navigation history. Keeps a back/forward stack
 * per product tab in sessionStorage, with a global recently-viewed list.
 */
export function useNavigationHistory({
  pathname,
  search = "",
  onNavigate,
  activeTabId,
  activeTabHref,
  tabIds,
}: {
  pathname: string;
  search?: string;
  onNavigate: (href: string) => void;
  activeTabId: string;
  /** Path the active product tab expects (from tabs state). */
  activeTabHref: string;
  tabIds: readonly string[];
}): UseNavigationHistoryResult {
  const [store, setStore] = useState<NavigationHistoryStore>(() =>
    activeTabId
      ? createInitialHistoryStore(
          activeTabId,
          pathname,
          resolveHistoryEntryTitle(pathname, new Map()),
        )
      : createEmptyHistoryStore(),
  );
  const [historyReady, setHistoryReady] = useState(false);
  const pageTitlesRef = useRef(new Map<string, string>());
  const pendingIndexRef = useRef<number | null>(null);
  const pendingTabSwitchRef = useRef(false);
  const hydratedRef = useRef(false);
  const initialHrefRef = useRef(buildHref(pathname, search));
  const activeTabIdRef = useRef(activeTabId);
  const storeRef = useRef(store);
  const onNavigateRef = useRef(onNavigate);
  const prevActiveTabIdRef = useRef(activeTabId);
  const tabIdsKey = tabIds.join("\0");

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    const currentHref = initialHrefRef.current;
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
    next = pruneStacks(next, tabIds.length > 0 ? tabIds : [activeTabId]);

    setStore(next);
    persistHistoryStore(next);
    hydratedRef.current = true;
    setHistoryReady(true);
    // Hydrate once on mount; tabIds pruning continues in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const currentHref = buildHref(pathname, search);
    const title = resolveHistoryEntryTitle(currentHref, pageTitlesRef.current);
    const pendingIndex = pendingIndexRef.current;
    pendingIndexRef.current = null;

    const locationMatchesTab =
      pathOnly(currentHref) === pathOnly(activeTabHref);
    const isTabSwitch = pendingTabSwitchRef.current;

    if (isTabSwitch && !locationMatchesTab) {
      // Wait until the router catches up to the tab's href so we don't
      // sync the previous tab's pathname onto the new tab's stack.
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
  }, [pathname, search, activeTabId, activeTabHref]);

  const registerPageTitle = useCallback((href: string, title: string) => {
    const normalized = normalizeTabHref(href);
    pageTitlesRef.current.set(normalized, title);

    setStore((current) => {
      let next = current;
      let changed = false;

      for (const [tabId, stack] of Object.entries(current.stacksByTabId)) {
        const updated = updateEntriesMatchingHref(stack, href, (entry) =>
          entry.title === title ? entry : { ...entry, title },
        );
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
        const updated = updateEntriesMatchingHref(stack, href, (entry) =>
          entry.icon === icon ? entry : { ...entry, icon },
        );
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

  const goToIndex = useCallback((index: number) => {
    const tabId = activeTabIdRef.current;
    const stack = getActiveStack(storeRef.current, tabId);
    const entry = stack?.entries[index];
    if (!entry) {
      return;
    }

    pendingIndexRef.current = index;
    onNavigateRef.current(entry.href);
  }, []);

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

  const navigateToHistoryEntry = useCallback((href: string) => {
    // Recent pages are global; always push into the active tab.
    onNavigateRef.current(href);
  }, []);

  const activeStack = activeTabId
    ? getActiveStack(store, activeTabId)
    : null;
  const currentHref = activeStack?.entries[activeStack.index]?.href;

  return useMemo(
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
      registerPageIcon,
      registerPageTitle,
    }),
    [
      activeStack,
      currentHref,
      goBack,
      goForward,
      historyReady,
      navigateToHistoryEntry,
      registerPageIcon,
      registerPageTitle,
      store,
    ],
  );
}
