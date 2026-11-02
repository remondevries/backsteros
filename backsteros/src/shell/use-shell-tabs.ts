import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  activateProductTab,
  buildProductTabHref,
  closeProductTab,
  createProductTab,
  cycleProductTab,
  normalizeTabHref,
  syncActiveTabToPath,
  useTabShortcuts,
  type ProductTabsState,
} from "@backsteros/ui/shell";
import { useNavigationHistory } from "@backsteros/ui/navigation";

import { withEntityDetailPageLayout } from "../lib/entity-detail-page-layout-href";
import { formatResolvedAppHref, resolveAppHref } from "../lib/resolve-app-href";
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

  /**
   * While a tab switch is in flight, location may update before (or after)
   * activeTabId. Skip syncActiveTabToPath until location matches the target
   * tab's bookmark so we never write the destination onto the previous tab.
   */
  const pendingTabSwitchRef = useRef<{
    tabId: string;
    href: string;
  } | null>(null);

  const tabsLocationKey = buildProductTabHref(
    location.pathname,
    search,
  );
  const [tabsSyncedLocationKey, setTabsSyncedLocationKey] =
    useState(tabsLocationKey);
  if (tabsLocationKey !== tabsSyncedLocationKey) {
    setTabsSyncedLocationKey(tabsLocationKey);

    const pending = pendingTabSwitchRef.current;
    // While a switch is in flight, location may update before activeTabId.
    // Never sync onto the previous tab — wait until activeTabId is the target.
    if (pending && tabsState.activeTabId !== pending.tabId) {
      // Consume the location key without syncing.
    } else {
      if (pending) {
        pendingTabSwitchRef.current = null;
      }
      setTabsState((current) =>
        syncActiveTabToPath(current, location.pathname, search),
      );
    }
  }

  const activeTab = tabsState.tabs.find(
    (tab) => tab.id === tabsState.activeTabId,
  );

  // Location may have landed (and been skipped) before activeTabId. Once the
  // target tab is active, clear pending and catch the bookmark up if needed.
  const pendingAfterLocation = pendingTabSwitchRef.current;
  if (
    pendingAfterLocation &&
    pendingAfterLocation.tabId === tabsState.activeTabId
  ) {
    pendingTabSwitchRef.current = null;
    if (activeTab && activeTab.href !== tabsLocationKey) {
      setTabsState((current) =>
        syncActiveTabToPath(current, location.pathname, search),
      );
    }
  }

  const navigateTo = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
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
      if (tabId === tabsState.activeTabId) return;

      const currentHref = buildProductTabHref(
        location.pathname,
        search,
      );
      const needsNavigate = tab.href !== currentHref;

      // Mark pending before any state/nav so a location update cannot clobber
      // the previous tab's href while activeTabId is mid-flight.
      if (needsNavigate) {
        pendingTabSwitchRef.current = { tabId, href: tab.href };
      }

      // Set activeTabId synchronously (same turn as navigate) — do not defer
      // with startTransition; that was the race that rewrote the wrong tab.
      setTabsState((current) => activateProductTab(current, tabId));

      if (needsNavigate) {
        navigateToHref(navigate, tab.href);
      }
    },
    [
      location.pathname,
      search,
      navigate,
      tabsState.tabs,
      tabsState.activeTabId,
    ],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabsState((current) => {
        const { state, navigateHref } = closeProductTab(current, tabId);
        if (navigateHref != null) {
          // Closing active (or last) tab: arm pending so sync does not write
          // the destination onto a stale active id during the navigate.
          pendingTabSwitchRef.current = {
            tabId: state.activeTabId,
            href: navigateHref,
          };
          queueMicrotask(() => navigateToHref(navigate, navigateHref));
        }
        return state;
      });
    },
    [navigate],
  );

  /** Homepage: rewrite the active tab bookmark to Inbox and navigate there. */
  const goHome = useCallback(() => {
    setTabsState((current) =>
      syncActiveTabToPath(current, "/inbox", ""),
    );
    navigateToHref(navigate, "/inbox");
  }, [navigate]);

  const openNewTab = useCallback(() => {
    const tab = createProductTab("/inbox");
    pendingTabSwitchRef.current = { tabId: tab.id, href: tab.href };
    setTabsState((current) => ({
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
    }));
    navigateToHref(navigate, tab.href);
  }, [navigate]);

  const openHrefInNewTab = useCallback(
    (href: string) => {
      const destination = formatResolvedAppHref(
        resolveAppHref(withEntityDetailPageLayout(href)),
      );
      const tab = createProductTab(destination);
      pendingTabSwitchRef.current = { tabId: tab.id, href: tab.href };
      setTabsState((current) => ({
        tabs: [...current.tabs, tab],
        activeTabId: tab.id,
      }));
      navigateToHref(navigate, destination);
    },
    [navigate],
  );

  const activatePreviousTab = useCallback(() => {
    setTabsState((current) => {
      const { state, navigateHref } = cycleProductTab(current, -1);
      if (navigateHref != null) {
        pendingTabSwitchRef.current = {
          tabId: state.activeTabId,
          href: navigateHref,
        };
        queueMicrotask(() => navigateToHref(navigate, navigateHref));
      }
      return state;
    });
  }, [navigate]);

  const activateNextTab = useCallback(() => {
    setTabsState((current) => {
      const { state, navigateHref } = cycleProductTab(current, 1);
      if (navigateHref != null) {
        pendingTabSwitchRef.current = {
          tabId: state.activeTabId,
          href: navigateHref,
        };
        queueMicrotask(() => navigateToHref(navigate, navigateHref));
      }
      return state;
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
    goHome,
    updateActiveTabTitle,
    updateActiveTabIcon,
    activateTab,
    closeTab,
    openNewTab,
    openHrefInNewTab,
  };
}
