"use client";

import type { ReactNode } from "react";

import { filterProjectsForDefaultPicker } from "@backsteros/contracts";

import { brandfetchLogoUrlFromWebsite } from "../../organizations/brandfetch-logo.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { OrganizationDropdownMark } from "../organizations/organization-dropdown-mark.js";
import { ProjectStatusIcon } from "../projects/project-status-icon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { projectTypeDropdownFilter } from "../../dropdowns/searchable-dropdown-option-filters.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import type { EmailMailbox } from "../../email/email.js";
import { emailMailboxFromParts } from "../../email/email.js";

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
  /** Job title / role (shown muted next to the name on Agent keys). */
  title?: string | null;
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
  website?: string | null;
  avatarStorageKey?: string | null;
  avatarSrc?: string | null;
};

export type ProjectDropdownItem = {
  key: string;
  name: string;
  icon?: string | null;
  type?: string | null;
  status?: string | null;
};

function personIcon(size = 14, avatarSrc?: string | null): ReactNode {
  if (avatarSrc) {
    return <EntityAvatarIcon src={avatarSrc} size={size} kind="contact" />;
  }
  return <ContactPersonIcon size={size} className="text-foreground/70" />;
}

function orgIcon(size = 18, avatarSrc?: string | null): ReactNode {
  return <OrganizationDropdownMark src={avatarSrc} size={size} />;
}

function resolveContactAvatarSrc(
  contact: AssigneeDropdownContact,
  avatarSrcById?: Readonly<Record<string, string | null | undefined>>,
): string | null {
  const fromMap = avatarSrcById?.[contact.id];
  if (typeof fromMap === "string" && fromMap.trim()) return fromMap.trim();
  const fromContact = contact.avatarSrc?.trim();
  return fromContact || null;
}

/**
 * Merchant / org menu avatar URL priority:
 * 1. Live uploaded blob map (`avatarSrcById`) — manual overwrite + hydrated Brand API
 * 2. Pre-baked `organization.avatarSrc` from the caller
 * 3. Brandfetch CDN from `website` + client id
 */
export function resolveOrgDropdownAvatarSrc(
  organization: OrganizationDropdownItem,
  options?: {
    avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
    brandfetchClientId?: string | null;
  },
): string | null {
  const fromMap = options?.avatarSrcById?.[organization.id];
  if (typeof fromMap === "string" && fromMap.trim()) return fromMap.trim();

  const baked = organization.avatarSrc?.trim() || null;
  if (baked) return baked;

  return brandfetchLogoUrlFromWebsite(
    organization.website,
    options?.brandfetchClientId,
  );
}

function projectStatusGlyph(size = 14, status?: string | null): ReactNode {
  return <ProjectStatusIcon status={status ?? "backlog"} size={size} />;
}

/**
 * Assignee options — label is the contact name (or “Unassigned”).
 * Icons use the person glyph by default; uploaded avatars replace it when present.
 * Pass `avatarSrcById` from the desktop/design avatar map so every surface
 * resolves the same way (do not build assignee menus without it when avatars exist).
 * List rows also use `avatarSrc` for initial/avatar marks.
 */
export function buildAssigneeDropdownOptions(
  contacts: AssigneeDropdownContact[],
  options?: {
    iconSize?: number;
    avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
  },
): SearchableDropdownOption<string>[] {
  const iconSize = options?.iconSize ?? 14;
  const avatarSrcById = options?.avatarSrcById;
  return [
    {
      value: DROPDOWN_NONE_VALUE,
      label: "Unassigned",
      searchTerms: "unassigned none",
      icon: personIcon(iconSize),
    },
    ...contacts.map((contact) => {
      const avatarSrc = resolveContactAvatarSrc(contact, avatarSrcById);
      return {
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
        icon: personIcon(iconSize, avatarSrc),
        avatarSrc,
      };
    }),
  ];
}

/**
 * Letter contact options — same as assignee, empty row labeled “No contact”.
 */
export function buildContactDropdownOptions(
  contacts: AssigneeDropdownContact[],
  options?: {
    iconSize?: number;
    avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
  },
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
 * Pass `avatarSrcById` (desktop blob map) and/or `brandfetchClientId` so
 * merchant / org menus show logos the same way assignee menus show photos.
 */
export function buildOrganizationDropdownOptions(
  organizations: OrganizationDropdownItem[],
  options?: {
    iconSize?: number;
    includeNone?: boolean;
    avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
    brandfetchClientId?: string | null;
  },
): SearchableDropdownOption<string>[] {
  // Match bank-account marks / panel CSS slot (18px).
  const iconSize = options?.iconSize ?? 18;
  const includeNone = options?.includeNone ?? true;
  const rows = organizations.map((organization) => {
    const avatarSrc = resolveOrgDropdownAvatarSrc(organization, options);
    return {
      value: organization.id,
      label: organization.name,
      searchTerms: organization.name,
      icon: orgIcon(iconSize, avatarSrc),
      avatarSrc,
    };
  });
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
 * Hides completed/canceled/duplicated by default (OS-7); pass `keepKeys` for
 * a currently assigned closed project. Status icon is the row/trigger mark.
 */
export function buildProjectDropdownOptions(
  projects: ProjectDropdownItem[],
  options?: {
    iconSize?: number;
    includeNone?: boolean;
    keepKeys?: readonly (string | null | undefined)[];
    /** Include completed/canceled/duplicated; default picker hides those. */
    includeClosed?: boolean;
  },
): SearchableDropdownOption<string>[] {
  const iconSize = options?.iconSize ?? 14;
  const includeNone = options?.includeNone ?? true;
  const visible = options?.includeClosed
    ? projects
    : filterProjectsForDefaultPicker(projects, {
        keepKeys: options?.keepKeys,
      });
  const rows = visible.map((project) => {
    const typeFilter = projectTypeDropdownFilter(project.type);
    return {
      value: project.key,
      label: project.name,
      searchTerms: `${project.key} ${project.name} ${project.status ?? ""} ${typeFilter.filterLabel}`,
      icon: projectStatusGlyph(iconSize, project.status),
      filterValue: typeFilter.filterValue,
      filterLabel: typeFilter.filterLabel,
    };
  });
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
    const parts = emailMailboxFromParts(mailbox);
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
      label: parts.primary,
      ...(parts.secondary ? { secondaryLabel: parts.secondary } : {}),
      icon,
      avatarSrc: mailbox.avatarSrc ?? null,
      searchTerms: [
        mailbox.email,
        mailbox.displayName ?? "",
        mailbox.contactName ?? "",
        mailbox.inboxId,
        parts.title,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}
