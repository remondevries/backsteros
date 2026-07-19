import {
  isRouteFamily,
  navigation,
  titleForPath,
  type NavigationItemIconId,
  type RouteFamily,
} from "./navigation.js";

export type ProductTab = {
  id: string;
  href: string;
  title: string;
  /** Optional entity icon payload; shells may render a custom glyph. */
  icon?: string | null;
};

export type ProductTabsState = {
  tabs: ProductTab[];
  activeTabId: string;
};

export function normalizeTabHref(href: string): string {
  if (!href || href === "/") return "/";

  const [path] = href.split(/[?#]/);
  return path!.replace(/\/+$/, "") || "/";
}

export function getTabTitleForHref(href: string): string {
  const normalized = normalizeTabHref(href);
  const navMatch = navigation.find((item) => item.href === normalized);
  if (navMatch) {
    return navMatch.label;
  }
  const journalDate = normalized.match(/^\/journal\/([^/]+)$/)?.[1];
  if (journalDate) {
    return decodeURIComponent(journalDate);
  }
  return titleForPath(normalized);
}

export function resolveTabNavIconId(
  href: string,
): NavigationItemIconId | null {
  const segments = normalizeTabHref(href).split("/").filter(Boolean);
  const family = segments[0];
  if (!isRouteFamily(family)) {
    return null;
  }
  if (family === "areas") {
    return "projects";
  }
  const mapped: Record<Exclude<RouteFamily, "areas">, NavigationItemIconId> = {
    inbox: "inbox",
    journal: "journal",
    knowledge: "knowledge",
    tasks: "tasks",
    projects: "projects",
    letters: "letters",
    contacts: "contacts",
    organizations: "organizations",
    settings: "settings",
  };
  return mapped[family] ?? null;
}

export function createProductTab(href: string, title?: string): ProductTab {
  const normalized = normalizeTabHref(href);
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    href: normalized,
    title: title ?? getTabTitleForHref(normalized),
  };
}

export function createDefaultTabsState(pathname: string): ProductTabsState {
  const tab = createProductTab(pathname);
  return { tabs: [tab], activeTabId: tab.id };
}

export function syncActiveTabToPath(
  state: ProductTabsState,
  pathname: string,
): ProductTabsState {
  const normalized = normalizeTabHref(pathname);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab || activeTab.href === normalized) {
    return state;
  }

  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? {
            ...tab,
            href: normalized,
            title: getTabTitleForHref(normalized),
            icon: undefined,
          }
        : tab,
    ),
  };
}
