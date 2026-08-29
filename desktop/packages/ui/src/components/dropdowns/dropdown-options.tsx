"use client";

import type { ReactNode } from "react";

import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import type { EmailMailbox } from "../../email/email.js";

/** Sentinel for unassigned / none rows (assignee, contact, organization, area). */
export const DROPDOWN_NONE_VALUE = "__none__";

/** Sentinel for clearing project on task/letter surfaces (matches Next compose). */
export const DROPDOWN_NO_PROJECT_VALUE = "__no_project__";

/** Sentinel for clearing goal on finance transaction surfaces. */
export const DROPDOWN_NO_GOAL_VALUE = "__no_goal__";

/** Sentinel for clearing recurring on finance transaction surfaces. */
export const DROPDOWN_NO_RECURRING_VALUE = "__no_recurring__";

export type AssigneeDropdownContact = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  emails?:
    | Array<{ label?: string | null; address?: string | null } | string>
    | null;
  organizationName?: string | null;
  avatarSrc?: string | null;
};

export type OrganizationDropdownItem = {
  id: string;
  name: string;
  number?: number | null;
  key?: string | null;
  avatarSrc?: string | null;
};

export type ProjectDropdownItem = {
  key: string;
  name: string;
  icon?: string | null;
  type?: string | null;
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

function projectGlyph(
  size = 14,
  icon?: string | null,
  type?: string | null,
): ReactNode {
  return (
    <ProjectOcticon
      icon={icon}
      type={type}
      size={size}
      className="text-foreground/70"
    />
  );
}

/**
 * Assignee options — label is the contact name (or “Unassigned”).
 * Icons use the person glyph by default; uploaded avatars replace it when present.
 * List rows also use `avatarSrc` for initial/avatar marks.
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
      searchTerms: [
        contact.name,
        contact.firstName ?? "",
        contact.lastName ?? "",
        contact.email ?? "",
        ...(contact.emails ?? []).map((entry) =>
          typeof entry === "string" ? entry : (entry.address ?? ""),
        ),
        contact.organizationName ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      icon: personIcon(iconSize, contact.avatarSrc),
      avatarSrc: contact.avatarSrc ?? null,
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
    avatarSrc: organization.avatarSrc ?? null,
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
    icon: projectGlyph(iconSize, project.icon, project.type),
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

/** From-inbox options for email compose — contact avatar when linked. */
export function buildEmailMailboxDropdownOptions(
  mailboxes: readonly EmailMailbox[],
  options?: { iconSize?: number },
): SearchableDropdownOption<string>[] {
  const iconSize = options?.iconSize ?? 14;
  return mailboxes.map((mailbox) => {
    const label =
      mailbox.contactName?.trim() ||
      mailbox.displayName?.trim() ||
      mailbox.email ||
      mailbox.inboxId;
    const icon = mailbox.avatarSrc ? (
      <EntityAvatarIcon
        src={mailbox.avatarSrc}
        size={iconSize}
        kind="contact"
      />
    ) : (
      <EmailNavIcon />
    );
    return {
      value: mailbox.inboxId,
      label,
      icon,
      avatarSrc: mailbox.avatarSrc ?? null,
      searchTerms: [
        mailbox.email,
        mailbox.displayName ?? "",
        mailbox.contactName ?? "",
        mailbox.inboxId,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}
