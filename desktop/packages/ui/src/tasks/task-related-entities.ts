import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import { DROPDOWN_NONE_VALUE } from "../components/dropdowns/dropdown-options.js";

export type TaskRelatedKind = "contact" | "organization" | "email";

export type TaskRelatedSelection = {
  contactIds: string[];
  organizationIds: string[];
  emailIds: string[];
};

const CONTACT_PREFIX = "contact:";
const ORGANIZATION_PREFIX = "organization:";
const EMAIL_PREFIX = "email:";

export function encodeTaskRelatedValue(
  kind: TaskRelatedKind,
  id: string,
): string {
  if (kind === "contact") return `${CONTACT_PREFIX}${id}`;
  if (kind === "organization") return `${ORGANIZATION_PREFIX}${id}`;
  return `${EMAIL_PREFIX}${id}`;
}

export function decodeTaskRelatedValue(
  value: string,
): { kind: TaskRelatedKind; id: string } | null {
  if (value.startsWith(CONTACT_PREFIX)) {
    const id = value.slice(CONTACT_PREFIX.length).trim();
    return id ? { kind: "contact", id } : null;
  }
  if (value.startsWith(ORGANIZATION_PREFIX)) {
    const id = value.slice(ORGANIZATION_PREFIX.length).trim();
    return id ? { kind: "organization", id } : null;
  }
  if (value.startsWith(EMAIL_PREFIX)) {
    const id = value.slice(EMAIL_PREFIX.length).trim();
    return id ? { kind: "email", id } : null;
  }
  return null;
}

export function encodeTaskRelatedValues(
  contactIds: readonly string[],
  organizationIds: readonly string[],
  emailIds: readonly string[] = [],
): string[] {
  return [
    ...contactIds.map((id) => encodeTaskRelatedValue("contact", id)),
    ...organizationIds.map((id) => encodeTaskRelatedValue("organization", id)),
    ...emailIds.map((id) => encodeTaskRelatedValue("email", id)),
  ];
}

export function decodeTaskRelatedValues(
  values: readonly string[],
): TaskRelatedSelection {
  const contactIds: string[] = [];
  const organizationIds: string[] = [];
  const emailIds: string[] = [];
  const seenContacts = new Set<string>();
  const seenOrgs = new Set<string>();
  const seenEmails = new Set<string>();
  for (const value of values) {
    const decoded = decodeTaskRelatedValue(value);
    if (!decoded) continue;
    if (decoded.kind === "contact") {
      if (seenContacts.has(decoded.id)) continue;
      seenContacts.add(decoded.id);
      contactIds.push(decoded.id);
    } else if (decoded.kind === "organization") {
      if (seenOrgs.has(decoded.id)) continue;
      seenOrgs.add(decoded.id);
      organizationIds.push(decoded.id);
    } else {
      if (seenEmails.has(decoded.id)) continue;
      seenEmails.add(decoded.id);
      emailIds.push(decoded.id);
    }
  }
  return { contactIds, organizationIds, emailIds };
}

/**
 * Merge contact, organization, and email-thread dropdown options into one
 * Related list. Option values are prefixed so ids never collide.
 */
export function buildTaskRelatedDropdownOptions(input: {
  contactOptions: SearchableDropdownOption<string>[];
  organizationOptions: SearchableDropdownOption<string>[];
  emailOptions?: SearchableDropdownOption<string>[];
}): SearchableDropdownOption<string>[] {
  const contacts = input.contactOptions
    .filter((option) => option.value !== DROPDOWN_NONE_VALUE)
    .map((option) => ({
      ...option,
      value: encodeTaskRelatedValue("contact", option.value),
      searchTerms: [option.searchTerms, "contact", option.label]
        .filter(Boolean)
        .join(" "),
    }));
  const organizations = input.organizationOptions
    .filter((option) => option.value !== DROPDOWN_NONE_VALUE)
    .map((option) => ({
      ...option,
      value: encodeTaskRelatedValue("organization", option.value),
      searchTerms: [option.searchTerms, "organization", "org", option.label]
        .filter(Boolean)
        .join(" "),
    }));
  const emails = (input.emailOptions ?? [])
    .filter((option) => option.value !== DROPDOWN_NONE_VALUE)
    .map((option) => ({
      ...option,
      value: encodeTaskRelatedValue("email", option.value),
      searchTerms: [option.searchTerms, "email", "mail", option.label]
        .filter(Boolean)
        .join(" "),
    }));
  return [...contacts, ...organizations, ...emails];
}

export function formatTaskRelatedSelectionLabel(input: {
  values: readonly string[];
  options: SearchableDropdownOption<string>[];
  emptyLabel: string;
  singularFallback?: string;
}): string {
  const count = input.values.length;
  if (count === 0) return input.emptyLabel;
  if (count === 1) {
    const match = input.options.find(
      (option) => option.value === input.values[0],
    );
    return match?.label ?? input.singularFallback ?? "1 related";
  }
  return `${count} related`;
}
