import {
  isRouteFamily,
  navigation,
  titleForPath,
  type NavigationItemIconId,
  type RouteFamily,
} from "./navigation.js";
import { isEntityRouteId } from "../navigation-trail/entity-route-uuid.js";
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

/**
 * Query keys worth keeping on a product tab when returning to Calendar.
 * Includes open meeting overlay (`meeting` / `meetingLayout`) so tab switches
 * and refresh restore the note. Task overlays stay ephemeral.
 */
const CALENDAR_TAB_SEARCH_KEYS = [
  "mode",
  "view",
  "date",
  "week",
  "month",
  "meeting",
  "meetingLayout",
] as const;

/**
 * Build the href stored on a product tab. Most routes are pathname-only;
 * `/calendar` keeps mode / view / Timetracking period / open meeting so tab
 * switches restore Calendar chrome and the meeting note overlay.
 */
export function buildProductTabHref(pathname: string, search = ""): string {
  const path = normalizeTabHref(pathname);
  if (path !== "/calendar") {
    return path;
  }

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const next = new URLSearchParams();
  for (const key of CALENDAR_TAB_SEARCH_KEYS) {
    const value = params.get(key)?.trim();
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `${path}?${query}` : path;
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
    calendar: "calendar",
    areas: "areas",
    projects: "projects",
    development: "development",
    letters: "letters",
    finance: "finance",
    communication: "communication",
    social: "social",
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
  const path = normalizeTabHref(href);
  const queryIndex = href.indexOf("?");
  const search = queryIndex >= 0 ? href.slice(queryIndex) : "";
  const storedHref = buildProductTabHref(path, search);
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    href: storedHref,
    title: title ?? getTabTitleForHref(path),
  };
}

export function createDefaultTabsState(pathname: string): ProductTabsState {
  const tab = createProductTab(pathname);
  return { tabs: [tab], activeTabId: tab.id };
}

export function syncActiveTabToPath(
  state: ProductTabsState,
  pathname: string,
  search = "",
): ProductTabsState {
  const pathOnly = normalizeTabHref(pathname);
  const href = buildProductTabHref(pathname, search);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab) {
    return state;
  }

  const activePath = normalizeTabHref(activeTab.href);

  // Same path: still apply a primed entity title so a tab that was left on a
  // generic "Projects"/"Project" label catches up when the name is known.
  // Also refresh calendar query (mode/view/period) when it changes in-place.
  if (activePath === pathOnly) {
    const primed = getPrimedTabTitle(pathOnly);
    const hrefChanged = activeTab.href !== href;
    const titleChanged = Boolean(primed && activeTab.title !== primed);
    if (!hrefChanged && !titleChanged) {
      return state;
    }
    return {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? {
              ...tab,
              href,
              title: primed && titleChanged ? primed : tab.title,
            }
          : tab,
      ),
    };
  }

  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? {
            ...tab,
            href,
            title: getTabTitleForHref(pathOnly),
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
