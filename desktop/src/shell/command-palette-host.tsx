import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CommandPaletteView,
  contactMatchesSlug,
  getProjectRouteParamFromPathname,
  getSelectedContactSlugFromPathname,
  getSelectedOrganizationSlugFromPathname,
  organizationMatchesSlug,
  useCommandPaletteState,
} from "@backsteros/ui";

import { useCommandPaletteSearchFn } from "../lib/command-palette-search";
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
      ? contacts.find((entry) => contactMatchesSlug(entry, contactSlug))
      : null;
    const orgSlug = getSelectedOrganizationSlugFromPathname(pathname);
    const organization = orgSlug
      ? organizations.find((entry) => organizationMatchesSlug(entry, orgSlug))
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
        const contact = contacts.find((entry) =>
          contactMatchesSlug(entry, context.contactRouteParam!),
        );
        return {
          projectId: null,
          contactId: contact?.id ?? null,
          organizationId: null,
        };
      }
      if (context.kind === "organization" && context.organizationRouteParam) {
        const organization = organizations.find((entry) =>
          organizationMatchesSlug(entry, context.organizationRouteParam!),
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
    />
  );
}
