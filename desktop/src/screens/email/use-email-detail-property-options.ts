import { useMemo } from "react";
import {
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
} from "@backsteros/ui";

import { useDesktopAvatarSrcMap, withAvatarSrc } from "../../lib/avatar-src";
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
        withAvatarSrc(organizations, organizationAvatarSrc),
      ),
    [organizationAvatarSrc, organizations],
  );

  const contactOptions = useMemo(
    () =>
      buildContactDropdownOptions(withAvatarSrc(contacts, contactAvatarSrc)),
    [contactAvatarSrc, contacts],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(withAvatarSrc(contacts, contactAvatarSrc)),
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
