import type { BreadcrumbItem } from "@/components/shell/breadcrumb";
import { normalizeTabHref } from "@/lib/tabs/get-tab-title";
import { isSettingsPath } from "@/lib/settings/tabs";
import {
  getTasksDueListHref,
  isTasksDueFilter,
  isTasksPagePathname,
  parseTasksDueFilterFromPathname,
} from "@/lib/tasks-due-filters";

export function getAppBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  const normalized = normalizeTabHref(pathname);

  switch (normalized) {
    case "/":
      return [{ label: "Inbox" }];
    case "/inbox":
      return [{ label: "Inbox" }];
    case "/tasks":
      return [{ label: "Tasks" }];
    case "/projects":
      return [{ label: "Projects" }];
    case "/projects/new":
      return [
        { label: "Projects", href: "/projects" },
        { label: "New project" },
      ];
    default:
      return [];
  }
}

export function isTasksDueTaskDetailPath(pathname: string): boolean {
  const normalized = normalizeTabHref(pathname);
  const match = normalized.match(/^\/tasks\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return false;
  }

  return isTasksDueFilter(match[1]!);
}

/** `/tasks/{slug}` detail (BOS today-filter shorthand without the due segment). */
export function isTasksSectionTaskDetailPath(pathname: string): boolean {
  const normalized = normalizeTabHref(pathname);
  if (isTasksDueTaskDetailPath(normalized)) {
    return true;
  }

  const match = normalized.match(/^\/tasks\/([^/]+)$/);
  if (!match) {
    return false;
  }

  return !isTasksDueFilter(match[1]!);
}

export type AppPageBreadcrumbConfig = {
  showBreadcrumb: boolean;
  anchors: BreadcrumbItem[];
  includeTrailingItems: boolean;
};

export function getAppPageBreadcrumbConfig(
  pathname: string,
): AppPageBreadcrumbConfig {
  const normalized = normalizeTabHref(pathname);
  const staticItems = getAppBreadcrumbItems(pathname);

  if (staticItems.length > 0) {
    return {
      showBreadcrumb: true,
      anchors: staticItems,
      includeTrailingItems: false,
    };
  }

  if (isTasksSectionTaskDetailPath(normalized)) {
    const dueFilter = parseTasksDueFilterFromPathname(normalized);

    return {
      showBreadcrumb: true,
      anchors: [
        {
          label: "Tasks",
          href: dueFilter ? getTasksDueListHref(dueFilter) : "/tasks",
        },
      ],
      includeTrailingItems: true,
    };
  }

  if (isTasksPagePathname(normalized)) {
    return {
      showBreadcrumb: true,
      anchors: [{ label: "Tasks" }],
      includeTrailingItems: false,
    };
  }

  return {
    showBreadcrumb: false,
    anchors: [],
    includeTrailingItems: false,
  };
}

export function isAppBreadcrumbPath(pathname: string): boolean {
  return getAppPageBreadcrumbConfig(pathname).showBreadcrumb;
}

/**
 * True for routes that render breadcrumb chrome (static app config or
 * RegisterBreadcrumbChrome). Used to reserve the header slot while registration
 * catches up after navigation / Suspense.
 */
export function pathnameExpectsBreadcrumbChrome(pathname: string): boolean {
  if (isSettingsPath(pathname)) {
    return false;
  }

  if (getAppPageBreadcrumbConfig(pathname).showBreadcrumb) {
    return true;
  }

  const normalized = normalizeTabHref(pathname);
  return (
    normalized === "/" ||
    normalized.startsWith("/inbox") ||
    normalized.startsWith("/tasks") ||
    normalized.startsWith("/projects") ||
    normalized.startsWith("/knowledge") ||
    normalized.startsWith("/journal") ||
    normalized.startsWith("/letters") ||
    normalized.startsWith("/contacts") ||
    normalized.startsWith("/organizations")
  );
}
