"use client";

import { useMemo, type ReactNode } from "react";

import { OrganizationAssigneeIcon } from "@/components/organizations/organization-assignee-icon";
import { OrganizationIcon } from "@/components/icons/organization-icon";
import type { SearchableDropdownOption } from "@/components/ui/searchable-dropdown";
import {
  PROJECT_ORGANIZATION_NONE,
  type AssignableOrganization,
} from "@/lib/organizations/assignable-organization";

export function useOrganizationDropdownOptions(
  organizations: AssignableOrganization[],
): SearchableDropdownOption<string>[] {
  return useMemo(
    () => [
      {
        value: PROJECT_ORGANIZATION_NONE,
        label: "No organization",
        icon: <OrganizationIcon size={14} className="text-foreground/70" />,
        searchTerms: "none unassigned",
      },
      ...organizations.map((organization) => ({
        value: organization.id,
        label: organization.name,
        searchTerms: organization.name,
        icon: (
          <OrganizationAssigneeIcon
            organization={{
              id: organization.id,
              avatarStorageKey: organization.avatarStorageKey,
              avatarUpdatedAt: organization.avatarUpdatedAt,
            }}
          />
        ),
      })),
    ],
    [organizations],
  );
}

export function getOrganizationFallbackIcon(
  organization: AssignableOrganization | undefined,
): ReactNode {
  if (organization) {
    return (
      <OrganizationAssigneeIcon
        organization={{
          id: organization.id,
          avatarStorageKey: organization.avatarStorageKey,
          avatarUpdatedAt: organization.avatarUpdatedAt,
        }}
      />
    );
  }

  return <OrganizationIcon size={14} className="text-foreground/70" />;
}
