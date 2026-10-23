import {
  coerceOrganizationEmailEntries,
  getContactEmailAddresses,
} from "@backsteros/contracts";

import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";

export type EmailRecipientContactInput = {
  id: string;
  name: string;
  /** Organization name — included in search so typing an org finds its people. */
  organizationName?: string | null;
  email?: string | null;
  emails?:
    | ReadonlyArray<{ label?: string | null; address?: string | null } | string>
    | string
    | null;
  avatarSrc?: string | null;
};

export type EmailRecipientOrganizationInput = {
  id: string;
  name: string;
  email?: string | null;
  emails?:
    | ReadonlyArray<{ label?: string | null; address?: string | null } | string>
    | string
    | null;
  avatarSrc?: string | null;
};

/** Loose check for composer freeform To (unknown addresses stay sendable). */
export function isPlausibleEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function organizationEmailAddresses(
  organization: EmailRecipientOrganizationInput,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const address = raw?.trim();
    if (!address || !address.includes("@")) return;
    const key = address.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(address);
  };
  push(organization.email);
  // PowerSync / API may still hand emails as a JSON string — coerce first so
  // we never iterate characters of a serialized array.
  for (const entry of coerceOrganizationEmailEntries(organization.emails)) {
    push(entry.address);
  }
  return out;
}

/**
 * One dropdown row per contact/org email address — value is the bare address
 * so freeform unknown emails share the same `to` string model.
 */
export function buildEmailRecipientDropdownOptions(input: {
  contacts: readonly EmailRecipientContactInput[];
  organizations?: readonly EmailRecipientOrganizationInput[];
  iconForContact?: (
    contact: EmailRecipientContactInput,
  ) => SearchableDropdownOption<string>["icon"];
  iconForOrganization?: (
    organization: EmailRecipientOrganizationInput,
  ) => SearchableDropdownOption<string>["icon"];
}): SearchableDropdownOption<string>[] {
  const options: SearchableDropdownOption<string>[] = [];
  const seen = new Set<string>();

  for (const contact of input.contacts) {
    const name = contact.name.trim() || "Contact";
    const organizationName = contact.organizationName?.trim() || "";
    for (const address of getContactEmailAddresses(contact)) {
      const trimmed = address.trim();
      const key = trimmed.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      options.push({
        value: trimmed,
        label: name,
        secondaryLabel: `(${trimmed})`,
        searchTerms: [name, organizationName, trimmed, contact.id, "contact"]
          .filter(Boolean)
          .join(" "),
        group: "Contacts",
        icon: input.iconForContact?.(contact),
        avatarSrc: contact.avatarSrc ?? null,
      });
    }
  }

  for (const organization of input.organizations ?? []) {
    const name = organization.name.trim() || "Organization";
    for (const address of organizationEmailAddresses(organization)) {
      const trimmed = address.trim();
      const key = trimmed.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      options.push({
        value: trimmed,
        label: name,
        secondaryLabel: `(${trimmed})`,
        searchTerms: [name, trimmed, organization.id, "organization", "org"]
          .filter(Boolean)
          .join(" "),
        group: "Organizations",
        icon: input.iconForOrganization?.(organization),
        avatarSrc: organization.avatarSrc ?? null,
      });
    }
  }

  return options;
}
