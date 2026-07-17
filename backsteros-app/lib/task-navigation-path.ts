import { taskMatchesRouteSlug } from "@/lib/entity-slugs";
import {
  getContactTaskHref,
  getContactTaskHrefFromKey,
  getDueTaskDetailHref,
  getInboxTaskHref,
  getProjectTaskHref,
} from "@/lib/entity-route-hrefs";
import type { Task } from "@/lib/db/schema";
import type { TasksDueFilter } from "@/lib/tasks-due-filters";

export {
  getContactTaskHref,
  getContactTaskHrefFromKey,
  getDueTaskDetailHref,
  getInboxTaskHref,
  getProjectTaskHref,
};

export function getSelectedTaskSlugFromPathname(
  pathname: string,
): string | undefined {
  const dueMatch = pathname.match(/^\/tasks\/[^/]+\/([^/]+)$/);
  if (dueMatch) {
    return decodeURIComponent(dueMatch[1]!);
  }

  const inboxMatch = pathname.match(/^\/inbox\/([^/]+)/);
  if (inboxMatch) {
    return decodeURIComponent(inboxMatch[1]!);
  }

  const projectMatch = pathname.match(/^\/projects\/[^/]+\/tasks\/([^/]+)/);
  if (projectMatch) {
    return decodeURIComponent(projectMatch[1]!);
  }

  const orgProjectMatch = pathname.match(
    /^\/organizations\/[^/]+\/projects\/[^/]+\/tasks\/([^/]+)/,
  );
  if (orgProjectMatch) {
    return decodeURIComponent(orgProjectMatch[1]!);
  }

  const contactMatch = pathname.match(/^\/contacts\/[^/]+\/tasks\/([^/]+)/);
  if (contactMatch) {
    return decodeURIComponent(contactMatch[1]!);
  }

  const orgContactMatch = pathname.match(
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/tasks\/([^/]+)/,
  );
  return orgContactMatch?.[1]
    ? decodeURIComponent(orgContactMatch[1]!)
    : undefined;
}

/** @deprecated Use getSelectedTaskSlugFromPathname */
export function getSelectedTaskIdFromPathname(
  pathname: string,
): string | undefined {
  return getSelectedTaskSlugFromPathname(pathname);
}

export function isTaskSlugSelected(
  task: Pick<Task, "number">,
  routeSlug: string | null | undefined,
  contextKey: string,
): boolean {
  return taskMatchesRouteSlug(task, routeSlug, contextKey);
}

export function isProjectTaskDetailPath(pathname: string): boolean {
  return (
    /^\/projects\/[^/]+\/tasks\/[^/]+$/.test(pathname) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/tasks\/[^/]+$/.test(pathname)
  );
}

export function isContactTaskDetailPath(pathname: string): boolean {
  return /^\/contacts\/[^/]+\/tasks\/[^/]+$/.test(pathname);
}

export function isDueTaskDetailPath(pathname: string): boolean {
  return /^\/tasks\/[^/]+\/[^/]+$/.test(pathname);
}

export function parseDueTaskDetailPathname(pathname: string): {
  dueFilter: TasksDueFilter;
  taskSlug: string;
} | null {
  const match = pathname.match(/^\/tasks\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    dueFilter: match[1]! as TasksDueFilter,
    taskSlug: decodeURIComponent(match[2]!),
  };
}
