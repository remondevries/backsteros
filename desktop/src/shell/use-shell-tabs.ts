import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  buildProductTabHref,
  createProductTab,
  normalizeTabHref,
  syncActiveTabToPath,
  useTabShortcuts,
  type ProductTabsState,
} from "@backsteros/ui/shell";
import { useNavigationHistory } from "@backsteros/ui/navigation";

import { navigateToHref } from "../router/navigate-href";
import { useShellLocation } from "../lib/shell-route-keep-alive";
import { loadTabsState, TABS_STORAGE_KEY } from "./app-shell-tabs";

export function useShellTabs() {
  const location = useShellLocation();
  const navigate = useNavigate();
  const search = location.searchStr;

  const [tabsState, setTabsState] = useState<ProductTabsState>(() =>
    loadTabsState(location.pathname, search),
  );

  const tabsLocationKey = buildProductTabHref(
    location.pathname,
    search,
  );
  const [tabsSyncedLocationKey, setTabsSyncedLocationKey] =
    useState(tabsLocationKey);
  if (tabsLocationKey !== tabsSyncedLocationKey) {
    setTabsSyncedLocationKey(tabsLocationKey);
    setTabsState((current) =>
      syncActiveTabToPath(current, location.pathname, search),
    );
  }

  const navigateTo = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  const activeTab = tabsState.tabs.find(
    (tab) => tab.id === tabsState.activeTabId,
  );
  const tabIds = useMemo(
    () => tabsState.tabs.map((tab) => tab.id),
    [tabsState.tabs],
  );

  const history = useNavigationHistory({
    pathname: location.pathname,
    search,
    onNavigate: navigateTo,
    activeTabId: tabsState.activeTabId,
    activeTabHref: activeTab?.href ?? location.pathname,
    tabIds,
  });

  const updateActiveTabTitle = useCallback((title: string, forHref?: string) => {
    setTabsState((current) => {
      const active = current.tabs.find((tab) => tab.id === current.activeTabId);
      if (!active) return current;
      if (
        forHref != null &&
        normalizeTabHref(active.href) !== normalizeTabHref(forHref)
      ) {
        return current;
      }
      if (active.title === title) return current;
      return {
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === current.activeTabId ? { ...tab, title } : tab,
        ),
      };
    });
  }, []);

  const updateActiveTabIcon = useCallback(
    (icon: string | null, forHref?: string) => {
      setTabsState((current) => {
        const active = current.tabs.find(
          (tab) => tab.id === current.activeTabId,
        );
        if (!active) return current;
        if (
          forHref != null &&
          normalizeTabHref(active.href) !== normalizeTabHref(forHref)
        ) {
          return current;
        }
        if ((active.icon ?? null) === icon) return current;
        return {
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.id === current.activeTabId ? { ...tab, icon } : tab,
          ),
        };
      });
    },
    [],
  );

  useEffect(() => {
    const payload = JSON.stringify(tabsState);
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, payload);
      return;
    } catch (error) {
      const isQuota =
        error instanceof DOMException &&
        (error.name === "QuotaExceededError" ||
          error.name === "NS_ERROR_DOM_QUOTA_REACHED");
      if (!isQuota) return;

      try {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (
            key &&
            (key.startsWith("backsteros-desktop.agent-chat-transcript.") ||
              key.startsWith("backsteros-development.agent-chat-transcript."))
          ) {
            keys.push(key);
          }
        }
        for (const key of keys) {
          window.localStorage.removeItem(key);
        }
        window.localStorage.setItem(TABS_STORAGE_KEY, payload);
      } catch {
        /* ignore — prefer a live shell over persisted tabs */
      }
    }
  }, [tabsState]);

  const activateTab = useCallback(
    (tabId: string) => {
      const tab = tabsState.tabs.find((entry) => entry.id === tabId);
      if (!tab) return;
      const currentHref = buildProductTabHref(
        location.pathname,
        search,
      );
      // Flip content first (warm keep-alive). Defer tab chrome so setTabsState
      // does not share the paint-critical frame with the section swap.
      if (tab.href !== currentHref) {
        navigateToHref(navigate, tab.href);
      }
      startTransition(() => {
        setTabsState((current) => ({ ...current, activeTabId: tabId }));
      });
    },
    [location.pathname, search, navigate, tabsState.tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabsState((current) => {
        if (current.tabs.length <= 1) {
          return current;
        }
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) {
          return current;
        }
        const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
        const closingActive = current.activeTabId === tabId;
        const nextActive =
          closingActive
            ? (nextTabs[Math.max(0, index - 1)] ?? nextTabs[0])!
            : current.tabs.find((tab) => tab.id === current.activeTabId)!;
        if (closingActive) {
          queueMicrotask(() => navigateToHref(navigate, nextActive.href));
        }
        return {
          tabs: nextTabs,
          activeTabId: closingActive ? nextActive.id : current.activeTabId,
        };
      });
    },
    [navigate],
  );

  const openNewTab = useCallback(() => {
    const tab = createProductTab("/inbox");
    setTabsState((current) => ({
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
    }));
    navigateToHref(navigate, tab.href);
  }, [navigate]);

  const activatePreviousTab = useCallback(() => {
    setTabsState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const previous =
        current.tabs[(index - 1 + current.tabs.length) % current.tabs.length]!;
      queueMicrotask(() => navigateToHref(navigate, previous.href));
      return { ...current, activeTabId: previous.id };
    });
  }, [navigate]);

  const activateNextTab = useCallback(() => {
    setTabsState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const next = current.tabs[(index + 1) % current.tabs.length]!;
      queueMicrotask(() => navigateToHref(navigate, next.href));
      return { ...current, activeTabId: next.id };
    });
  }, [navigate]);

  useTabShortcuts({
    enabled: true,
    activeTabId: tabsState.activeTabId,
    openNewTab,
    closeTab,
    activatePreviousTab,
    activateNextTab,
  });

  return {
    tabsState,
    setTabsState,
    history,
    navigateTo,
    updateActiveTabTitle,
    updateActiveTabIcon,
    activateTab,
    closeTab,
    openNewTab,
  };
}
