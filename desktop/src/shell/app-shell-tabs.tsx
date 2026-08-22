import {
  createDefaultTabsState,
  syncActiveTabToPath,
  type ProductTabsState,
} from "@backsteros/ui";

export const TABS_STORAGE_KEY = "backsteros.desktop.app-tabs";

export function loadTabsState(pathname: string): ProductTabsState {
  if (typeof window === "undefined") {
    return createDefaultTabsState(pathname);
  }
  try {
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) {
      return createDefaultTabsState(pathname);
    }
    const parsed = JSON.parse(raw) as ProductTabsState;
    if (!parsed.tabs?.length || !parsed.activeTabId) {
      return createDefaultTabsState(pathname);
    }
    return syncActiveTabToPath(parsed, pathname);
  } catch {
    return createDefaultTabsState(pathname);
  }
}
