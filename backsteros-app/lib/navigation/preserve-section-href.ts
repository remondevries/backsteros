import { encodeContactKeySlug, encodeTaskSlug } from "@/lib/entity-slugs";
import {
  getContactRouteScopeFromPathname,
  getScopedContactTaskHref,
} from "@/lib/contact-route-scope";
import { getInboxTaskHref } from "@/lib/entity-route-hrefs";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectTaskHref,
} from "@/lib/project-route-scope";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import {
  getTasksDueListHref,
  parseTasksDueFilter,
} from "@/lib/tasks-due-filters";

export type TaskProjectChangeNavigationResult = {
  projectKey: string | null;
  contactKey: string | null;
  taskNumber: number;
};

export function getTaskNavigationHrefAfterProjectChange(
  pathname: string,
  result: TaskProjectChangeNavigationResult,
): string | null {
  const contactTasksSection = pathname.match(
    /^\/contacts\/([^/]+)\/tasks(?:\/([^/]+))?/,
  );
  if (contactTasksSection) {
    const contactRouteParam = contactTasksSection[1]!;

    if (result.projectKey) {
      return `/contacts/${contactRouteParam}/tasks/${encodeTaskSlug(
        result.projectKey,
        result.taskNumber,
      )}`;
    }

    if (contactTasksSection[2]) {
      if (result.contactKey) {
        return `/contacts/${contactRouteParam}/tasks/${encodeTaskSlug(
          result.contactKey,
          result.taskNumber,
        )}`;
      }

      return `/contacts/${contactRouteParam}/tasks/${encodeTaskSlug(
        INBOX_TASK_KEY,
        result.taskNumber,
      )}`;
    }

    return `/contacts/${contactRouteParam}/tasks`;
  }

  const orgContactTasksSection = pathname.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)\/tasks(?:\/([^/]+))?/,
  );
  if (orgContactTasksSection) {
    const organizationRouteParam = orgContactTasksSection[1]!;
    const contactRouteParam = orgContactTasksSection[2]!;
    const base = `/organizations/${organizationRouteParam}/contacts/${contactRouteParam}/tasks`;

    if (result.projectKey) {
      return `${base}/${encodeTaskSlug(result.projectKey, result.taskNumber)}`;
    }

    if (orgContactTasksSection[3]) {
      if (result.contactKey) {
        return `${base}/${encodeTaskSlug(result.contactKey, result.taskNumber)}`;
      }

      return `${base}/${encodeTaskSlug(INBOX_TASK_KEY, result.taskNumber)}`;
    }

    return base;
  }

  const projectTasksSection = pathname.match(/^\/projects\/([^/]+)\/tasks/);
  if (projectTasksSection) {
    if (result.projectKey) {
      return getScopedProjectTaskHref(result.projectKey, result.taskNumber);
    }

    return `/projects/${projectTasksSection[1]}/tasks`;
  }

  const orgProjectTasksSection = pathname.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)\/tasks/,
  );
  if (orgProjectTasksSection) {
    if (result.projectKey) {
      return getScopedProjectTaskHref(
        result.projectKey,
        result.taskNumber,
        {
          kind: "organization",
          organizationRouteParam: orgProjectTasksSection[1]!,
        },
      );
    }

    return `/organizations/${orgProjectTasksSection[1]}/projects/${orgProjectTasksSection[2]}/tasks`;
  }

  if (pathname.startsWith("/inbox")) {
    if (result.projectKey) {
      return getScopedProjectTaskHref(result.projectKey, result.taskNumber);
    }

    return getInboxTaskHref(result.taskNumber);
  }

  const dueTasksDetail = pathname.match(/^\/tasks\/([^/]+)\/[^/]+$/);
  if (dueTasksDetail) {
    if (result.projectKey) {
      return getScopedProjectTaskHref(result.projectKey, result.taskNumber);
    }

    return getTasksDueListHref(parseTasksDueFilter(dueTasksDetail[1]));
  }

  if (result.projectKey) {
    const scope = getProjectRouteScopeFromPathname(pathname);
    return getScopedProjectTaskHref(result.projectKey, result.taskNumber, scope);
  }

  if (result.contactKey) {
    return `/contacts/${encodeContactKeySlug(result.contactKey)}/tasks/${encodeTaskSlug(
      result.contactKey,
      result.taskNumber,
    )}`;
  }

  return null;
}

export function getContactScopedTaskHref(
  task: {
    id: string;
    projectId: string | null;
    contactId: string | null;
    number: number;
  },
  contactKey: string,
  contactId: string,
  projects: readonly { id: string; key: string }[],
  pathname?: string,
): string {
  const scope = pathname
    ? getContactRouteScopeFromPathname(pathname)
    : { kind: "standalone" as const };
  const contactRouteParam =
    getSelectedContactRouteParamFromPathname(pathname) ??
    encodeContactKeySlug(contactKey);

  return getScopedContactTaskHref(
    task,
    contactKey,
    contactId,
    projects,
    scope,
    contactRouteParam,
  );
}

function getSelectedContactRouteParamFromPathname(
  pathname?: string,
): string | undefined {
  if (!pathname) {
    return undefined;
  }

  const orgContact = pathname.match(/^\/organizations\/[^/]+\/contacts\/([^/]+)/);
  if (orgContact) {
    return decodeURIComponent(orgContact[1]!);
  }

  const contact = pathname.match(/^\/contacts\/([^/]+)/);
  if (contact) {
    return decodeURIComponent(contact[1]!);
  }

  return undefined;
}
