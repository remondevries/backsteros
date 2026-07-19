"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeTabHref } from "../tabs.js";
import { NAVIGATION_HISTORY_STORAGE_KEY } from "./constants.js";
import {
  applyPathnameChange,
  areHistoryStatesEqual,
  createInitialHistoryState,
  getRecentHistoryPages,
  resolveHistoryEntryTitle,
} from "./history-engine.js";
import type { NavigationHistoryState } from "./types.js";

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

/**
 * Framework-agnostic in-app navigation history. Mirrors the Next.js
 * NavigationHistoryProvider: it observes `pathname`/`search` changes, keeps a
 * back/forward stack in sessionStorage, and drives navigation through the host
 * `onNavigate` callback (e.g. react-router `navigate`).
 */
export function useNavigationHistory({
  pathname,
  search = "",
  onNavigate,
}: {
  pathname: string;
  search?: string;
  onNavigate: (href: string) => void;
}): UseNavigationHistoryResult {
  const [state, setState] = useState<NavigationHistoryState>(() =>
    createInitialHistoryState(
      pathname,
      resolveHistoryEntryTitle(pathname, new Map()),
    ),
  );
  const [historyReady, setHistoryReady] = useState(false);
  const pageTitlesRef = useRef(new Map<string, string>());
  const pendingIndexRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);
  const initialHrefRef = useRef(buildHref(pathname, search));
  const stateRef = useRef(state);
  const onNavigateRef = useRef(onNavigate);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    const currentHref = initialHrefRef.current;
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

    const currentHref = buildHref(pathname, search);
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
  }, [pathname, search]);

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

  const registerPageIcon = useCallback(
    (href: string, icon: string | null) => {
      const normalized = normalizeTabHref(href);
      setState((current) => {
        const nextEntries = current.entries.map((entry) => {
          const [path] = entry.href.split(/[?#]/);
          return normalizeTabHref(path ?? "/") === normalized
            ? { ...entry, icon }
            : entry;
        });
        const next = { ...current, entries: nextEntries };
        persistHistoryState(next);
        return next;
      });
    },
    [],
  );

  const goToIndex = useCallback((index: number) => {
    const entry = stateRef.current.entries[index];
    if (!entry) {
      return;
    }

    pendingIndexRef.current = index;
    onNavigateRef.current(entry.href);
  }, []);

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
        onNavigateRef.current(href);
        return;
      }

      goToIndex(index);
    },
    [goToIndex],
  );

  return useMemo(
    () => ({
      canGoBack: historyReady && state.index > 0,
      canGoForward: historyReady && state.index < state.entries.length - 1,
      recentPages: historyReady ? getRecentHistoryPages(state) : [],
      goBack,
      goForward,
      navigateToHistoryEntry,
      registerPageIcon,
      registerPageTitle,
    }),
    [
      goBack,
      goForward,
      historyReady,
      navigateToHistoryEntry,
      registerPageIcon,
      registerPageTitle,
      state,
    ],
  );
}
