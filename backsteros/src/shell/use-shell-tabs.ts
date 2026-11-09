import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
} from "@backsteros/ui";
import { useNavigationHistory } from "@backsteros/ui/navigation";

import { withEntityDetailPageLayout } from "../lib/entity-detail-page-layout-href";
import { formatResolvedAppHref, resolveAppHref } from "../lib/resolve-app-href";
import {
  collectOpenRoomMeetingIds,
  setOpenRoomMeetingIds,
} from "../lib/room-session-keep-alive";
import { navigateToHref } from "../router/navigate-href";
import { pruneProductTabUiState } from "../lib/product-tab-ui-state";
import {
  syncWarmKeepAliveProductTabs,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import { loadTabsState, TABS_STORAGE_KEY } from "./app-shell-tabs";

function mirrorWarmKeepAliveTabs(state: ProductTabsState): void {
  syncWarmKeepAliveProductTabs({
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({ id: tab.id, href: tab.href })),
  });
  pruneProductTabUiState(state.tabs.map((tab) => tab.id));
}

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

  // Keep Director sessions mounted for every open room tab (not just the
  // active route) so cam/mic survive backgrounding.
  useEffect(() => {
    setOpenRoomMeetingIds(
      collectOpenRoomMeetingIds(
        tabsState.tabs,
        isMeetingRoomPath,
        parseMeetingRoomMeetingId,
      ),
    );
  }, [tabsState.tabs]);

  // Mirror product-tab bookmarks into the warm store before paint so same-
  // surface tab switches (two Inbox tabs) restore each tab's own lastHref.
  useLayoutEffect(() => {
    mirrorWarmKeepAliveTabs(tabsState);
  }, [tabsState]);

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

      // Flush the leaving tab’s live location into product-tab state before
      // switching — otherwise chrome rAF lag leaves a stale bookmark that
      // sync could prefer over warm (or lose on persistence).
      const flushed = syncActiveTabToPath(
        tabsState,
        location.pathname,
        search,
      );
      const next = activateProductTab(flushed, tabId);
      mirrorWarmKeepAliveTabs(next);
      setTabsState(next);

      if (needsNavigate) {
        navigateToHref(navigate, tab.href);
      }
    },
    [
      location.pathname,
      search,
      navigate,
      tabsState,
    ],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabsState((current) => {
        const { state, navigateHref } = closeProductTab(current, tabId);
        // Sync before the microtask navigate so the destination tab's lastHref
        // is bound before tryWarmKeepAliveFlip runs.
        mirrorWarmKeepAliveTabs(state);
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
    setTabsState((current) => {
      const next = syncActiveTabToPath(current, "/inbox", "");
      mirrorWarmKeepAliveTabs(next);
      return next;
    });
    navigateToHref(navigate, "/inbox");
  }, [navigate]);

  const openNewTab = useCallback(() => {
    const tab = createProductTab("/inbox");
    pendingTabSwitchRef.current = { tabId: tab.id, href: tab.href };
    setTabsState((current) => {
      const next = {
        tabs: [...current.tabs, tab],
        activeTabId: tab.id,
      };
      mirrorWarmKeepAliveTabs(next);
      return next;
    });
    navigateToHref(navigate, tab.href);
  }, [navigate]);

  const openHrefInNewTab = useCallback(
    (href: string) => {
      const destination = formatResolvedAppHref(
        resolveAppHref(withEntityDetailPageLayout(href)),
      );
      const tab = createProductTab(destination);
      pendingTabSwitchRef.current = { tabId: tab.id, href: tab.href };
      setTabsState((current) => {
        const next = {
          tabs: [...current.tabs, tab],
          activeTabId: tab.id,
        };
        mirrorWarmKeepAliveTabs(next);
        return next;
      });
      navigateToHref(navigate, destination);
    },
    [navigate],
  );

  const activatePreviousTab = useCallback(() => {
    setTabsState((current) => {
      const { state, navigateHref } = cycleProductTab(current, -1);
      mirrorWarmKeepAliveTabs(state);
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
      mirrorWarmKeepAliveTabs(state);
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
