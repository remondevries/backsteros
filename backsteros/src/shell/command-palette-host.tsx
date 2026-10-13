import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CommandPaletteView,
  getContactsHref,
  getOrganizationsHref,
  getProjectRouteParamFromPathname,
  getSelectedContactSlugFromPathname,
  getSelectedOrganizationSlugFromPathname,
  getUniqueListItemRouteParam,
  resolveListItemFromSlug,
  selectRecentCommandPaletteContacts,
  selectRecentCommandPaletteOrganizations,
  useCommandPaletteState,
} from "@backsteros/ui";

import { useCommandPaletteSearchFn } from "../lib/command-palette-search";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../lib/workspace-data";
import { useShellLocation } from "../lib/shell-route-keep-alive";
import { navigateToHref } from "../router/navigate-href";

/** Isolated command palette — re-renders only on palette context + route, not full shell. */
export function CommandPaletteHost() {
  const location = useShellLocation();
  const pathname = location.pathname;
  const routerNavigate = useNavigate();
  const { mode } = useCommandPaletteState();

  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );

  const searchFn = useCommandPaletteSearchFn();
  const { projects } = useDesktopWorkspaceProjects();
  const { contacts, organizations } = useDesktopWorkspacePeople();

  // Session-cached blob URLs for every contact/org with an uploaded avatar so
  // both the recent list and typed search hits can resolve images.
  const contactAvatarSrcById = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrcById = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );

  const recentContacts = useMemo(
    () =>
      selectRecentCommandPaletteContacts(
        contacts.map((contact) => ({
          id: contact.id,
          title: contact.name,
          subtitle: contact.organizationName ?? null,
          href: getContactsHref(
            getUniqueListItemRouteParam(contact, contacts),
          ),
          avatarSrc: contactAvatarSrcById[contact.id] ?? null,
          updatedAt: contact.updatedAt ?? contact.avatarUpdatedAt ?? null,
        })),
      ),
    [contactAvatarSrcById, contacts],
  );

  const recentOrganizations = useMemo(
    () =>
      selectRecentCommandPaletteOrganizations(
        organizations.map((organization) => ({
          id: organization.id,
          title: organization.name,
          subtitle:
            organization.number != null
              ? `O-${organization.number}`
              : (organization.key ?? null),
          href: getOrganizationsHref(
            getUniqueListItemRouteParam(organization, organizations),
          ),
          avatarSrc: organizationAvatarSrcById[organization.id] ?? null,
          updatedAt:
            organization.updatedAt ?? organization.avatarUpdatedAt ?? null,
        })),
      ),
    [organizationAvatarSrcById, organizations],
  );

  const paletteEntityNames = useMemo(() => {
    if (mode !== "search") {
      return {
        projectName: null,
        contactName: null,
        organizationName: null,
      };
    }
    const projectParam = getProjectRouteParamFromPathname(pathname);
    const project = projectParam
      ? projects.find(
          (entry) =>
            entry.key.toLowerCase() === projectParam.toLowerCase() ||
            entry.id === projectParam,
        )
      : null;
    const contactSlug = getSelectedContactSlugFromPathname(pathname);
    const contact = contactSlug
      ? resolveListItemFromSlug(contacts, contactSlug)
      : null;
    const orgSlug = getSelectedOrganizationSlugFromPathname(pathname);
    const organization = orgSlug
      ? resolveListItemFromSlug(organizations, orgSlug)
      : null;
    return {
      projectName: project?.name ?? null,
      contactName: contact?.name ?? null,
      organizationName: organization?.name ?? null,
    };
  }, [contacts, mode, organizations, pathname, projects]);

  const resolvePaletteContextIds = useCallback(
    (context: {
      kind: string;
      projectRouteParam?: string;
      contactRouteParam?: string;
      organizationRouteParam?: string;
    } | null) => {
      if (!context) {
        return {
          projectId: null as string | null,
          contactId: null as string | null,
          organizationId: null as string | null,
        };
      }
      if (context.kind === "project" && context.projectRouteParam) {
        const project = projects.find(
          (entry) =>
            entry.key.toLowerCase() ===
              context.projectRouteParam!.toLowerCase() ||
            entry.id === context.projectRouteParam,
        );
        return {
          projectId: project?.id ?? null,
          contactId: null,
          organizationId: null,
        };
      }
      if (context.kind === "contact" && context.contactRouteParam) {
        const contact = resolveListItemFromSlug(
          contacts,
          context.contactRouteParam,
        );
        return {
          projectId: null,
          contactId: contact?.id ?? null,
          organizationId: null,
        };
      }
      if (context.kind === "organization" && context.organizationRouteParam) {
        const organization = resolveListItemFromSlug(
          organizations,
          context.organizationRouteParam,
        );
        return {
          projectId: null,
          contactId: null,
          organizationId: organization?.id ?? null,
        };
      }
      return { projectId: null, contactId: null, organizationId: null };
    },
    [contacts, organizations, projects],
  );

  return (
    <CommandPaletteView
      navigate={navigate}
      pathname={pathname}
      entityNames={paletteEntityNames}
      resolveContextIds={resolvePaletteContextIds}
      search={searchFn}
      recentContacts={recentContacts}
      recentOrganizations={recentOrganizations}
      contactAvatarSrcById={contactAvatarSrcById}
      organizationAvatarSrcById={organizationAvatarSrcById}
    />
  );
}
