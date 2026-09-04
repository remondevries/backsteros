import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import { DROPDOWN_NONE_VALUE } from "../components/dropdowns/dropdown-options.js";

export type TaskRelatedKind = "contact" | "organization";

export type TaskRelatedSelection = {
  contactIds: string[];
  organizationIds: string[];
};

const CONTACT_PREFIX = "contact:";
const ORGANIZATION_PREFIX = "organization:";

export function encodeTaskRelatedValue(
  kind: TaskRelatedKind,
  id: string,
): string {
  return kind === "contact"
    ? `${CONTACT_PREFIX}${id}`
    : `${ORGANIZATION_PREFIX}${id}`;
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
  return null;
}

export function encodeTaskRelatedValues(
  contactIds: readonly string[],
  organizationIds: readonly string[],
): string[] {
  return [
    ...contactIds.map((id) => encodeTaskRelatedValue("contact", id)),
    ...organizationIds.map((id) => encodeTaskRelatedValue("organization", id)),
  ];
}

export function decodeTaskRelatedValues(
  values: readonly string[],
): TaskRelatedSelection {
  const contactIds: string[] = [];
  const organizationIds: string[] = [];
  const seenContacts = new Set<string>();
  const seenOrgs = new Set<string>();
  for (const value of values) {
    const decoded = decodeTaskRelatedValue(value);
    if (!decoded) continue;
    if (decoded.kind === "contact") {
      if (seenContacts.has(decoded.id)) continue;
      seenContacts.add(decoded.id);
      contactIds.push(decoded.id);
    } else {
      if (seenOrgs.has(decoded.id)) continue;
      seenOrgs.add(decoded.id);
      organizationIds.push(decoded.id);
    }
  }
  return { contactIds, organizationIds };
}

/**
 * Merge contact + organization dropdown options into one Related list.
 * Option values are prefixed so contact/org UUIDs never collide.
 */
export function buildTaskRelatedDropdownOptions(input: {
  contactOptions: SearchableDropdownOption<string>[];
  organizationOptions: SearchableDropdownOption<string>[];
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
  return [...contacts, ...organizations];
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
