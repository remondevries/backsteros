import { useParams } from "@tanstack/react-router";

import {
  getUniqueListItemRouteParam,
  resolveListItemFromSlug,
} from "@backsteros/ui";

import {
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../workspace-data";

export function orgRouteSlug(
  org: {
    number?: number | null;
    key?: string | null;
    id: string;
  },
  siblings: readonly {
    number?: number | null;
    key?: string | null;
    id: string;
  }[],
) {
  return getUniqueListItemRouteParam(org, siblings);
}

export function contactRouteSlug(
  contact: {
    number?: number | null;
    key?: string | null;
    id: string;
  },
  siblings: readonly {
    number?: number | null;
    key?: string | null;
    id: string;
  }[],
) {
  return getUniqueListItemRouteParam(contact, siblings);
}

export function useScopedOrganization(slug: string | undefined) {
  const { ready } = useDesktopWorkspaceMeta();
  const { organizations } = useDesktopWorkspacePeople();
  const organization = slug
    ? resolveListItemFromSlug(organizations, slug)
    : null;
  return {
    organization,
    organizationRouteParam: organization
      ? orgRouteSlug(organization, organizations)
      : (slug ?? ""),
    workspaceReady: ready,
  };
}

export function useScopedContact(slug: string | undefined) {
  const { ready } = useDesktopWorkspaceMeta();
  const { contacts } = useDesktopWorkspacePeople();
  const contact = slug ? resolveListItemFromSlug(contacts, slug) : null;
  return {
    contact,
    contactRouteParam: contact
      ? contactRouteSlug(contact, contacts)
      : (slug ?? ""),
    workspaceReady: ready,
  };
}

export function useScopedProject(slug: string | undefined) {
  const { projects } = useDesktopWorkspaceProjects();
  const project = slug
    ? projects.find(
        (entry) =>
          entry.key.toLowerCase() === slug.toLowerCase() || entry.id === slug,
      )
    : null;
  return {
    project,
    projectRouteParam: project?.key ?? slug ?? "",
  };
}

/** Reads org slug from `/organizations/:slug/...` style routes. */
export function useOrganizationRouteSlug() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  return slug;
}

/** Reads project slug from `/projects/:slug/...` style routes. */
export function useProjectRouteSlug() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  return slug;
}

/** Reads contact slug from `/contacts/:slug/...` style routes. */
export function useContactRouteSlug() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  return slug;
}
