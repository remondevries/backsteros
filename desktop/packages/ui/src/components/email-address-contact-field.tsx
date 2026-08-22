"use client";

import { useMemo, type ReactNode } from "react";

import { formatEmailPersonWithAddress, parseReplyToAddress } from "../email/email.js";
import { getCreateEntityFromQueryLabel } from "../dropdowns/searchable-dropdown-create-from-query.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "./dropdown-options.js";
import { PropertyDropdown } from "./property-dropdown.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";

/** Thread-level contact picker for a From or To address row. */
export type EmailThreadFromContactPicker = {
  contactId?: string | null;
  contactName?: string | null;
  /** Bare email used to pick the right address when To/From has multiple. */
  contactEmail?: string | null;
  contactAvatarSrc?: string | null;
  options: SearchableDropdownOption<string>[];
  onContactChange: (contactId: string | null) => void;
  onCreateContactFromQuery?: (query: string) => void;
};

function primaryAddressForContactLabel(
  value: string | string[] | null | undefined,
  preferredEmail?: string | null,
): string {
  const preferred = preferredEmail?.trim().toLowerCase() || null;
  if (Array.isArray(value)) {
    const entries = value.map((entry) => entry.trim()).filter(Boolean);
    if (preferred) {
      const match = entries.find(
        (entry) => parseReplyToAddress(entry).toLowerCase() === preferred,
      );
      if (match) return match;
      return preferredEmail!.trim();
    }
    return entries[0] ?? "";
  }
  if (typeof value === "string" && value.trim()) {
    // Single address wins — don't replace a typed composer To with contactEmail.
    return value.trim();
  }
  return preferredEmail?.trim() || "";
}

export type EmailAddressContactFieldProps = {
  address: string | string[] | null | undefined;
  addressLabel: string;
  contact: EmailThreadFromContactPicker;
  ariaLabel: string;
  disabled?: boolean;
  /** Optional control beside the chip (e.g. composer pencil to edit raw email). */
  endAction?: ReactNode;
  /** Render a `<span>` instead of `<dd>` — for use outside definition lists. */
  bare?: boolean;
  /** Show only the linked contact name in the chip (address shown elsewhere). */
  nameOnly?: boolean;
};

/** Contact dropdown for a From/To header row (`<dd>` wrapper included). */
export function EmailAddressContactField({
  address,
  addressLabel,
  contact,
  ariaLabel,
  disabled = false,
  endAction = null,
  bare = false,
  nameOnly = false,
}: EmailAddressContactFieldProps) {
  const Wrapper = bare ? "span" : "dd";
  const linkedContactId = contact.contactId?.trim() || null;
  const linkedContactName = contact.contactName?.trim() || null;
  const addressForLabel = primaryAddressForContactLabel(
    address,
    contact.contactEmail,
  );
  const selectedLabel = linkedContactName
    ? nameOnly
      ? linkedContactName
      : formatEmailPersonWithAddress(linkedContactName, addressForLabel)
    : addressLabel;

  const contactOptions = useMemo(() => {
    return contact.options.map((option) =>
      option.value === DROPDOWN_NONE_VALUE
        ? {
            ...option,
            label: "No contact",
            searchTerms: [
              "no contact",
              "none",
              addressLabel,
              addressForLabel,
            ]
              .filter(Boolean)
              .join(" "),
          }
        : option,
    );
  }, [addressForLabel, addressLabel, contact.options]);

  if (contactOptions.length === 0) {
    return (
      <Wrapper className={endAction ? "email-compose-to-field" : undefined}>
        <span>{addressLabel}</span>
        {endAction}
      </Wrapper>
    );
  }

  return (
    <Wrapper
      className={
        endAction
          ? "email-compose-from-field email-compose-to-field"
          : "email-compose-from-field"
      }
    >
      <PropertyDropdown
        value={linkedContactId ?? DROPDOWN_NONE_VALUE}
        options={contactOptions}
        onChange={(next) => contact.onContactChange(resolveDropdownNone(next))}
        disabled={disabled}
        searchPlaceholder="Link contact…"
        searchShortcutLabel="C"
        ariaLabel={ariaLabel}
        fallbackLabel={selectedLabel}
        selectedDisplayLabel={selectedLabel}
        mutedFallback={!linkedContactId}
        hideTriggerIcon
        triggerVariant="inlineChip"
        panelAlign="start"
        panelWidth={320}
        createFromQueryLabel={
          contact.onCreateContactFromQuery
            ? (query) => getCreateEntityFromQueryLabel("contact", query)
            : undefined
        }
        onCreateFromQuery={contact.onCreateContactFromQuery}
      />
      {endAction}
    </Wrapper>
  );
}
