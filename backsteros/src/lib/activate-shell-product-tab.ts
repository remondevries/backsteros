/**
 * Shared activate path used by {@link useShellTabs} and consumer tests.
 * Flush leaving-tab bookmark → activate → mirror warm lastHref (no clobber).
 */

import {
  activateProductTab,
  buildProductTabHref,
  syncActiveTabToPath,
  type ProductTabsState,
} from "@backsteros/ui/shell";

import { pruneProductTabUiState } from "./product-tab-ui-state";
import { syncWarmKeepAliveProductTabs } from "./shell-warm-keep-alive";

export function mirrorWarmKeepAliveTabsFromState(state: ProductTabsState): void {
  syncWarmKeepAliveProductTabs({
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({ id: tab.id, href: tab.href })),
  });
  pruneProductTabUiState(state.tabs.map((tab) => tab.id));
}

/**
 * Prepare a product-tab activation the same way the shell does before navigate.
 */
export function prepareActivateShellProductTab(input: {
  tabsState: ProductTabsState;
  tabId: string;
  livePathname: string;
  liveSearch?: string;
}): {
  next: ProductTabsState;
  /** Href to navigate when the target tab bookmark differs from live location. */
  navigateHref: string | null;
  skipped: boolean;
} {
  const { tabsState, tabId, livePathname } = input;
  const liveSearch = input.liveSearch ?? "";
  const tab = tabsState.tabs.find((entry) => entry.id === tabId);
  if (!tab || tabId === tabsState.activeTabId) {
    return { next: tabsState, navigateHref: null, skipped: true };
  }

  const currentHref = buildProductTabHref(livePathname, liveSearch);
  const needsNavigate = tab.href !== currentHref;

  const flushed = syncActiveTabToPath(tabsState, livePathname, liveSearch);
  const next = activateProductTab(flushed, tabId);
  mirrorWarmKeepAliveTabsFromState(next);

  return {
    next,
    navigateHref: needsNavigate ? tab.href : null,
    skipped: false,
  };
}
