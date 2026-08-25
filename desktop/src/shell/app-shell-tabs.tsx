import {
  createDefaultTabsState,
  syncActiveTabToPath,
  type ProductTabsState,
} from "@backsteros/ui";

export const TABS_STORAGE_KEY = "backsteros.desktop.app-tabs";

function defaultTabsHref(pathname: string, search = ""): string {
  if (!search) return pathname;
  return `${pathname}${search.startsWith("?") ? search : `?${search}`}`;
}

export function loadTabsState(
  pathname: string,
  search = "",
): ProductTabsState {
  const fallbackHref = defaultTabsHref(pathname, search);
  if (typeof window === "undefined") {
    return createDefaultTabsState(fallbackHref);
  }
  try {
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) {
      return createDefaultTabsState(fallbackHref);
    }
    const parsed = JSON.parse(raw) as ProductTabsState;
    if (!parsed.tabs?.length || !parsed.activeTabId) {
      return createDefaultTabsState(fallbackHref);
    }
    return syncActiveTabToPath(parsed, pathname, search);
  } catch {
    return createDefaultTabsState(fallbackHref);
  }
}
