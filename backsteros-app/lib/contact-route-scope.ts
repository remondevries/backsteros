import {
  encodeContactKeySlug,
  encodeTaskSlug,
  normalizeEntityRouteParam,
} from "@/lib/entity-slugs";
import type { ContactSectionId } from "@/lib/contact-sections";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";

export type ContactRouteScope =
  | { kind: "standalone" }
  | { kind: "organization"; organizationRouteParam: string };

export function parseOrganizationContactRoute(
  pathname: string,
): { organizationRouteParam: string; contactRouteParam: string } | null {
  const match = pathname.match(/^\/organizations\/([^/]+)\/contacts\/([^/]+)/);
  if (!match) {
    return null;
  }

  return {
    organizationRouteParam: decodeURIComponent(match[1]!),
    contactRouteParam: decodeURIComponent(match[2]!),
  };
}

export function isOrganizationContactDetailPath(pathname: string): boolean {
  return /^\/organizations\/[^/]+\/contacts\/[^/]+(?:\/|$)/.test(pathname);
}

export function getContactRouteScopeFromPathname(
  pathname: string,
): ContactRouteScope {
  const orgContact = parseOrganizationContactRoute(pathname);
  if (orgContact) {
    return {
      kind: "organization",
      organizationRouteParam: normalizeEntityRouteParam(
        orgContact.organizationRouteParam,
      ),
    };
  }

  return { kind: "standalone" };
}

export function getScopedContactBasePath(
  contactRouteParam: string,
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "organization") {
    return `/organizations/${scope.organizationRouteParam}/contacts/${contactRouteParam}`;
  }

  return `/contacts/${contactRouteParam}`;
}

export function getOrganizationContactHrefFromKey(
  organizationRouteParam: string,
  contactRouteParam: string,
): string {
  return getScopedContactBasePath(normalizeEntityRouteParam(contactRouteParam), {
    kind: "organization",
    organizationRouteParam: normalizeEntityRouteParam(organizationRouteParam),
  });
}

export function getScopedContactSectionHref(
  contactRouteParam: string,
  sectionId: ContactSectionId,
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  const base = getScopedContactBasePath(contactRouteParam, scope);

  if (sectionId === "overview") {
    return base;
  }

  return `${base}/${sectionId}`;
}

export function getScopedContactTaskHref(
  task: {
    projectId: string | null;
    contactId: string | null;
    number: number;
  },
  contactKey: string,
  contactId: string,
  projects: readonly { id: string; key: string }[],
  scope: ContactRouteScope = { kind: "standalone" },
  contactRouteParam?: string,
): string {
  const routeParam = contactRouteParam ?? encodeContactKeySlug(contactKey);
  const base = `${getScopedContactBasePath(routeParam, scope)}/tasks`;

  if (task.projectId) {
    const project = projects.find((entry) => entry.id === task.projectId);
    if (project) {
      return `${base}/${encodeTaskSlug(project.key, task.number)}`;
    }
  }

  if (task.contactId === contactId) {
    return `${base}/${encodeTaskSlug(contactKey, task.number)}`;
  }

  return `${base}/${encodeTaskSlug(INBOX_TASK_KEY, task.number)}`;
}

/** @deprecated Prefer getContactRouteScopeFromPathname */
export function getContactRouteScope(
  pathname: string,
): ContactRouteScope | null {
  return getContactRouteScopeFromPathname(pathname);
}
