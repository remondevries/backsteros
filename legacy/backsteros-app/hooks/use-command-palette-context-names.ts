"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useApiResource } from "@/lib/api-context";
import {
  contactMatchesRouteSlug,
  organizationMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import { parseOrganizationProjectRoute } from "@/lib/project-route-scope";
import { projectMatchesRouteParam } from "@/lib/project-sections";
import type {
  Contact as ApiContact,
  Organization as ApiOrganization,
  Project as ApiProject,
} from "@backsteros/contracts";

type ContextNames = {
  projectName: string | null;
  contactName: string | null;
  organizationName: string | null;
};

const EMPTY_NAMES: ContextNames = {
  projectName: null,
  contactName: null,
  organizationName: null,
};

export function useCommandPaletteContextNames(): ContextNames {
  const pathname = usePathname();
  const orgProject = parseOrganizationProjectRoute(pathname);
  const projectRouteParam =
    orgProject?.projectRouteParam ??
    pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const contactRouteParam = pathname.match(/^\/contacts\/([^/]+)/)?.[1];
  const organizationRouteParam =
    orgProject?.organizationRouteParam ??
    pathname.match(/^\/organizations\/([^/]+)/)?.[1];

  const needsProjects = Boolean(projectRouteParam && projectRouteParam !== "new");
  const needsContacts = Boolean(contactRouteParam);
  const needsOrganizations = Boolean(organizationRouteParam);

  const projectsResource = useApiResource<{ projects: ApiProject[] }>(
    (client) =>
      needsProjects
        ? client.requestJson("/api/v1/projects")
        : Promise.resolve({ projects: [] as ApiProject[] }),
    [needsProjects],
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>(
    (client) =>
      needsContacts
        ? client.requestJson("/api/v1/contacts")
        : Promise.resolve({ contacts: [] as ApiContact[] }),
    [needsContacts],
  );
  const organizationsResource = useApiResource<{
    organizations: ApiOrganization[];
  }>(
    (client) =>
      needsOrganizations
        ? client.requestJson("/api/v1/organizations")
        : Promise.resolve({ organizations: [] as ApiOrganization[] }),
    [needsOrganizations],
  );

  return useMemo(() => {
    const names: ContextNames = { ...EMPTY_NAMES };

    if (projectRouteParam && projectRouteParam !== "new") {
      const project = projectsResource.data?.projects.find((entry) =>
        projectMatchesRouteParam(entry, projectRouteParam),
      );
      names.projectName = project?.name ?? null;
    }

    if (contactRouteParam) {
      const contact = contactsResource.data?.contacts.find((entry) =>
        contactMatchesRouteSlug(entry, contactRouteParam),
      );
      names.contactName = contact?.name ?? null;
    }

    if (organizationRouteParam) {
      const organization = organizationsResource.data?.organizations.find(
        (entry) =>
          organizationMatchesRouteSlug(entry, organizationRouteParam),
      );
      names.organizationName = organization?.name ?? null;
    }

    return names;
  }, [
    contactRouteParam,
    contactsResource.data,
    organizationRouteParam,
    organizationsResource.data,
    projectRouteParam,
    projectsResource.data,
  ]);
}

/** Resolve route-param context to UUID ids for the search API. */
export function useResolvedSearchContextIds(pathname: string): {
  projectId: string | null;
  contactId: string | null;
  organizationId: string | null;
} {
  const orgProject = parseOrganizationProjectRoute(pathname);
  const projectRouteParam =
    orgProject?.projectRouteParam ??
    pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const contactRouteParam = pathname.match(/^\/contacts\/([^/]+)/)?.[1];
  const organizationRouteParam =
    orgProject?.organizationRouteParam ??
    pathname.match(/^\/organizations\/([^/]+)/)?.[1];

  const projectsResource = useApiResource<{ projects: ApiProject[] }>(
    (client) =>
      projectRouteParam && projectRouteParam !== "new"
        ? client.requestJson("/api/v1/projects")
        : Promise.resolve({ projects: [] as ApiProject[] }),
    [projectRouteParam],
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>(
    (client) =>
      contactRouteParam
        ? client.requestJson("/api/v1/contacts")
        : Promise.resolve({ contacts: [] as ApiContact[] }),
    [contactRouteParam],
  );
  const organizationsResource = useApiResource<{
    organizations: ApiOrganization[];
  }>(
    (client) =>
      organizationRouteParam
        ? client.requestJson("/api/v1/organizations")
        : Promise.resolve({ organizations: [] as ApiOrganization[] }),
    [organizationRouteParam],
  );

  const [ids, setIds] = useState({
    projectId: null as string | null,
    contactId: null as string | null,
    organizationId: null as string | null,
  });

  useEffect(() => {
    setIds({
      projectId:
        projectRouteParam && projectRouteParam !== "new"
          ? (projectsResource.data?.projects.find((entry) =>
              projectMatchesRouteParam(entry, projectRouteParam),
            )?.id ?? null)
          : null,
      contactId: contactRouteParam
        ? (contactsResource.data?.contacts.find((entry) =>
            contactMatchesRouteSlug(entry, contactRouteParam),
          )?.id ?? null)
        : null,
      organizationId: organizationRouteParam
        ? (organizationsResource.data?.organizations.find((entry) =>
            organizationMatchesRouteSlug(entry, organizationRouteParam),
          )?.id ?? null)
        : null,
    });
  }, [
    contactRouteParam,
    contactsResource.data,
    organizationRouteParam,
    organizationsResource.data,
    projectRouteParam,
    projectsResource.data,
  ]);

  return ids;
}
