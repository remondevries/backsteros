import { useMemo } from "react";
import {
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
} from "@backsteros/ui";

import {
  useDesktopAvatarSrcMap,
  withOrganizationAvatarSrc,
} from "../../lib/avatar-src";
import { useDesktopWorkspaceData } from "../../lib/workspace-data";

export function useEmailDetailPropertyOptions(
  contactAvatarSrc: Record<string, string>,
) {
  const { organizations, contacts, projects } = useDesktopWorkspaceData();
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withOrganizationAvatarSrc(organizations, organizationAvatarSrc),
      ),
    [organizationAvatarSrc, organizations],
  );

  const contactOptions = useMemo(
    () =>
      buildContactDropdownOptions(contacts, { avatarSrcById: contactAvatarSrc }),
    [contactAvatarSrc, contacts],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(contacts, { avatarSrcById: contactAvatarSrc }),
    [contactAvatarSrc, contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
          status: project.status,
        })),
      ),
    [projects],
  );

  return {
    organizations,
    contacts,
    projects,
    organizationOptions,
    contactOptions,
    assigneeOptions,
    projectOptions,
  };
}
