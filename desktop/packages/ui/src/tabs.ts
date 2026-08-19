import {
  isRouteFamily,
  navigation,
  titleForPath,
  type NavigationItemIconId,
  type RouteFamily,
} from "./navigation.js";
import { isEntityRouteId } from "./navigation-trail/entity-route-uuid.js";
import { getPrimedTabTitle } from "./primed-tab-title.js";

export type ProductTab = {
  id: string;
  href: string;
  title: string;
  /** Optional entity icon payload; shells may render a custom glyph. */
  icon?: string | null;
  /** Task entity id when this tab is on a task route (working/status icons). */
  taskId?: string | null;
  /** Last-known task status for status-icon rendering on task tabs. */
  taskStatus?: string | null;
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

/** Display slugs like `in-8` / `abc-12` — OK as interim tab labels. */
function isDisplayEntitySlug(segment: string): boolean {
  return /^[a-z][a-z0-9]*-\d+$/i.test(segment);
}

function looksLikeRawEntityId(segment: string): boolean {
  if (isEntityRouteId(segment)) return true;
  if (isDisplayEntitySlug(segment)) return false;
  // Local/optimistic ids, long opaque tokens, etc.
  return segment.length >= 20;
}

function fallbackTitleForEntityPath(normalized: string): string {
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return titleForPath(normalized);

  if (segments[0] === "projects" && segments.length === 2) {
    return "Project";
  }

  const last = segments.at(-1);
  if (!last) return titleForPath(normalized);

  // Avoid flashing UUID / opaque ids in the tab before RegisterPageTitle runs.
  if (looksLikeRawEntityId(decodeURIComponent(last))) {
    if (segments[0] === "inbox") return "Task";
    if (segments[0] === "letters") return "Letter";
    if (segments.includes("tasks")) return "Task";
    if (segments.includes("documents") || segments[0] === "knowledge") {
      return "Document";
    }
    return "Page";
  }

  if (segments.includes("tasks")) {
    return "Task";
  }

  return titleForPath(normalized);
}

export function getTabTitleForHref(href: string): string {
  const normalized = normalizeTabHref(href);

  const primed = getPrimedTabTitle(normalized);
  if (primed) {
    return primed;
  }

  const navMatch = navigation.find((item) => item.href === normalized);
  if (navMatch) {
    return navMatch.label;
  }
  if (normalized === "/journal/habits" || normalized.startsWith("/journal/habits/")) {
    return "Habit Tracker";
  }
  const journalDate = normalized.match(/^\/journal\/([^/]+)$/)?.[1];
  if (journalDate) {
    return decodeURIComponent(journalDate);
  }
  return fallbackTitleForEntityPath(normalized);
}

export function resolveTabNavIconId(
  href: string,
): NavigationItemIconId | null {
  const segments = normalizeTabHref(href).split("/").filter(Boolean);
  const family = segments[0];
  if (!isRouteFamily(family)) {
    return null;
  }
  const mapped: Record<RouteFamily, NavigationItemIconId> = {
    inbox: "inbox",
    email: "email",
    journal: "journal",
    knowledge: "knowledge",
    tasks: "tasks",
    areas: "areas",
    projects: "projects",
    development: "development",
    letters: "letters",
    finance: "finance",
    contacts: "contacts",
    organizations: "organizations",
    settings: "settings",
  };
  if (family === "journal" && segments[1] === "habits") {
    return "habits";
  }
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
  if (!activeTab) {
    return state;
  }

  // Same path: still apply a primed entity title so a tab that was left on a
  // generic "Projects"/"Project" label catches up when the name is known.
  if (activeTab.href === normalized) {
    const primed = getPrimedTabTitle(normalized);
    if (!primed || activeTab.title === primed) {
      return state;
    }
    return {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId ? { ...tab, title: primed } : tab,
      ),
    };
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
            // Cleared until the shell resolves live task meta for the new route.
            taskId: undefined,
            taskStatus: undefined,
          }
        : tab,
    ),
  };
}

/** Persist task id/status on the active tab for status icons across tab switches. */
export function syncActiveTabTaskMeta(
  state: ProductTabsState,
  meta: { taskId?: string | null; taskStatus?: string | null },
): ProductTabsState {
  const nextTaskId = meta.taskId ?? null;
  const nextTaskStatus = meta.taskStatus ?? null;
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab) {
    return state;
  }
  if (
    (activeTab.taskId ?? null) === nextTaskId &&
    (activeTab.taskStatus ?? null) === nextTaskStatus
  ) {
    return state;
  }
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? {
            ...tab,
            taskId: nextTaskId,
            taskStatus: nextTaskStatus,
          }
        : tab,
    ),
  };
}

/**
 * Refresh stored taskStatus on every open tab from live workspace data so
 * background tabs stay accurate when status changes elsewhere.
 */
export function refreshOpenTabTaskStatuses(
  state: ProductTabsState,
  statusByTaskId: ReadonlyMap<string, string>,
): ProductTabsState {
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    const taskId = tab.taskId?.trim();
    if (!taskId) return tab;
    const nextStatus = statusByTaskId.get(taskId);
    if (nextStatus == null || (tab.taskStatus ?? null) === nextStatus) {
      return tab;
    }
    changed = true;
    return { ...tab, taskStatus: nextStatus };
  });
  return changed ? { ...state, tabs } : state;
}
