"use client";

import type { ReactNode } from "react";

import { ContactPersonIcon } from "./contact-person-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { EntityAvatarIcon } from "./entity-avatar-icon.js";
import { OrganizationIcon } from "./organization-icon.js";
import { ProjectOcticon } from "./project-octicon.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";

/** Sentinel for unassigned / none rows (assignee, contact, organization, area). */
export const DROPDOWN_NONE_VALUE = "__none__";

/** Sentinel for clearing project on task/letter surfaces (matches Next compose). */
export const DROPDOWN_NO_PROJECT_VALUE = "__no_project__";

export type AssigneeDropdownContact = {
  id: string;
  name: string;
  email?: string | null;
  organizationName?: string | null;
  avatarSrc?: string | null;
};

export type OrganizationDropdownItem = {
  id: string;
  name: string;
  avatarSrc?: string | null;
};

export type ProjectDropdownItem = {
  key: string;
  name: string;
  icon?: string | null;
};

function personIcon(size = 14, avatarSrc?: string | null): ReactNode {
  if (avatarSrc) {
    return <EntityAvatarIcon src={avatarSrc} size={size} kind="contact" />;
  }
  return <ContactPersonIcon size={size} className="text-foreground/70" />;
}

function orgIcon(size = 14, avatarSrc?: string | null): ReactNode {
  if (avatarSrc) {
    return (
      <EntityAvatarIcon src={avatarSrc} size={size} kind="organization" />
    );
  }
  return <OrganizationIcon size={size} className="text-foreground/70" />;
}

function projectGlyph(size = 14, icon?: string | null): ReactNode {
  return (
    <ProjectOcticon icon={icon} size={size} className="text-foreground/70" />
  );
}

/**
 * Assignee options — label is the contact name (or “Unassigned”).
 * Matches Next.js `assignee-dropdown-options`.
 */
export function buildAssigneeDropdownOptions(
  contacts: AssigneeDropdownContact[],
  options?: { iconSize?: number },
): SearchableDropdownOption<string>[] {
  const iconSize = options?.iconSize ?? 14;
  return [
    {
      value: DROPDOWN_NONE_VALUE,
      label: "Unassigned",
      searchTerms: "unassigned none",
      icon: personIcon(iconSize),
    },
    ...contacts.map((contact) => ({
      value: contact.id,
      label: contact.name,
      searchTerms: [contact.name, contact.email ?? "", contact.organizationName ?? ""]
        .filter(Boolean)
        .join(" "),
      icon: personIcon(iconSize, contact.avatarSrc),
    })),
  ];
}

/**
 * Letter contact options — same as assignee, empty row labeled “No contact”.
 */
export function buildContactDropdownOptions(
  contacts: AssigneeDropdownContact[],
  options?: { iconSize?: number },
): SearchableDropdownOption<string>[] {
  return buildAssigneeDropdownOptions(contacts, options).map((option) =>
    option.value === DROPDOWN_NONE_VALUE
      ? {
          ...option,
          label: "No contact",
          searchTerms: "no contact none",
        }
      : option,
  );
}

/**
 * Organization options — label is the org name (or “No organization”).
 * Matches Next.js `organization-dropdown-options`.
 */
export function buildOrganizationDropdownOptions(
  organizations: OrganizationDropdownItem[],
  options?: { iconSize?: number; includeNone?: boolean },
): SearchableDropdownOption<string>[] {
  const iconSize = options?.iconSize ?? 14;
  const includeNone = options?.includeNone ?? true;
  const rows = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
    searchTerms: organization.name,
    icon: orgIcon(iconSize, organization.avatarSrc),
  }));
  if (!includeNone) return rows;
  return [
    {
      value: DROPDOWN_NONE_VALUE,
      label: "No organization",
      searchTerms: "none unassigned",
      icon: orgIcon(iconSize),
    },
    ...rows,
  ];
}

/**
 * Project options — label is the project name only; key is searchable.
 * Matches Next.js `task-project-field` / letter compose (with optional “No project”).
 */
export function buildProjectDropdownOptions(
  projects: ProjectDropdownItem[],
  options?: { iconSize?: number; includeNone?: boolean },
): SearchableDropdownOption<string>[] {
  const iconSize = options?.iconSize ?? 14;
  const includeNone = options?.includeNone ?? true;
  const rows = projects.map((project) => ({
    value: project.key,
    label: project.name,
    searchTerms: `${project.key} ${project.name}`,
    icon: projectGlyph(iconSize, project.icon),
  }));
  if (!includeNone) return rows;
  return [
    {
      value: DROPDOWN_NO_PROJECT_VALUE,
      label: "No project",
      searchTerms: "no project unassigned",
      icon: <DefaultProjectIcon size={iconSize} className="text-foreground/70" />,
    },
    ...rows,
  ];
}

export function resolveDropdownNone(
  value: string,
  noneValue: string = DROPDOWN_NONE_VALUE,
): string | null {
  return value === noneValue ? null : value;
}

export function resolveDropdownProjectKey(value: string): string | null {
  return value === DROPDOWN_NO_PROJECT_VALUE ? null : value;
}
