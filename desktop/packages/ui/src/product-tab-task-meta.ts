import { encodeTaskSlug, getInboxTaskRouteSlugForTask } from "./inbox-items.js";
import { parseLetterSlug } from "./letters.js";
import { parseTaskSlug } from "./resolve-history-entry-display.js";
import { getTaskDisplayId } from "./task-display-id.js";
import { isTasksDueFilter } from "./tasks-due-filters.js";
import { normalizeTabHref, type ProductTab } from "./tabs.js";

type TabTaskCandidate = {
  id: string;
  number: number;
  status: string;
  projectId: string | null;
  projectKey?: string | null;
  contactId?: string | null;
  contactKey?: string | null;
};

/**
 * Task route param from a product-tab href, if the tab is on a task detail
 * route (`/tasks/…`, `/inbox/…` task, scoped `…/tasks/:slug`).
 */
export function extractTaskRouteParamFromHref(href: string): string | null {
  const pathname = normalizeTabHref(href);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const tasksIdx = segments.lastIndexOf("tasks");
  if (tasksIdx >= 0) {
    const after = segments[tasksIdx + 1];
    if (!after) return null;

    // `/tasks/:dueFilter/:taskSlug`
    if (tasksIdx === 0 && segments.length >= 3) {
      return decodeURIComponent(segments[2]!);
    }

    // `/tasks/:taskId` — not a due-filter list route
    if (tasksIdx === 0 && segments.length === 2) {
      if (isTasksDueFilter(after)) return null;
      return decodeURIComponent(after);
    }

    // `/projects|contacts|…/tasks/:taskSlug`
    return decodeURIComponent(after);
  }

  if (segments[0] === "inbox" && segments.length === 2) {
    const slug = decodeURIComponent(segments[1]!);
    // Inbox letters use `ltr-N` (see getInboxItemRouteSlug).
    if (slug.toLowerCase().startsWith("ltr-")) {
      return null;
    }
    // Bare `L-N` letter slugs (letters section), when not a KEY-N task slug.
    if (parseLetterSlug(slug) !== null && parseTaskSlug(slug) === null) {
      return null;
    }
    return slug;
  }

  return null;
}

export function taskMatchesTabRouteParam(
  entry: TabTaskCandidate,
  routeParam: string,
): boolean {
  if (entry.id === routeParam) return true;

  const normalized = decodeURIComponent(routeParam).toLowerCase();
  const displayId = getTaskDisplayId(
    {
      number: entry.number,
      projectId: entry.projectId,
      contactId: entry.contactId,
    },
    entry.projectKey ?? entry.contactKey,
  );
  if (displayId?.toLowerCase() === normalized) return true;

  const slug = getInboxTaskRouteSlugForTask({
    number: entry.number,
    projectKey: entry.projectKey,
    contactKey: entry.contactKey,
  });
  if (slug === normalized) return true;

  if (
    entry.projectKey &&
    encodeTaskSlug(entry.projectKey, entry.number) === normalized
  ) {
    return true;
  }

  if (
    entry.contactKey &&
    encodeTaskSlug(entry.contactKey, entry.number) === normalized
  ) {
    return true;
  }

  return false;
}

export function findTaskForTabHref<T extends TabTaskCandidate>(
  href: string,
  tasks: readonly T[],
): T | null {
  const routeParam = extractTaskRouteParamFromHref(href);
  if (!routeParam) return null;
  return (
    tasks.find((task) => taskMatchesTabRouteParam(task, routeParam)) ?? null
  );
}

export type ProductTabTaskMeta = {
  taskId: string | null;
  taskStatus: string | null;
};

/** Resolve live task id/status for a tab (href lookup, then stored taskId). */
export function resolveProductTabTaskMeta(
  tab: ProductTab,
  tasks: readonly TabTaskCandidate[],
): ProductTabTaskMeta {
  const fromHref = findTaskForTabHref(tab.href, tasks);
  if (fromHref) {
    return { taskId: fromHref.id, taskStatus: fromHref.status };
  }

  const storedId = tab.taskId?.trim() || null;
  if (storedId) {
    const fromId = tasks.find((task) => task.id === storedId) ?? null;
    if (fromId) {
      return { taskId: fromId.id, taskStatus: fromId.status };
    }
    return {
      taskId: storedId,
      taskStatus: tab.taskStatus ?? null,
    };
  }

  const routeParam = extractTaskRouteParamFromHref(tab.href);
  if (routeParam) {
    return {
      taskId: routeParam,
      taskStatus: tab.taskStatus ?? null,
    };
  }

  return { taskId: null, taskStatus: null };
}
