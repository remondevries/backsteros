"use client";

import { useMemo, useState, useTransition } from "react";
import type { ContactSocialAccount } from "@backsteros/contracts";

import { ContactOverviewSummaryEditor } from "@/components/contacts/contact-overview-summary-editor";
import { ContactSocialAccountsEditor } from "@/components/contacts/contact-social-accounts-editor";
import {
  getOrganizationFallbackIcon,
  useOrganizationDropdownOptions,
} from "@/components/organizations/organization-dropdown-options";
import {
  OverviewDetailsField,
  overviewDetailsInputClassName,
} from "@/components/overview/overview-details-field";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import type { Contact, Organization } from "@/lib/db/schema";
import {
  updateContactDetailsAction,
  updateContactOrganizationAction,
} from "@/lib/mutations/contacts";
import {
  mapOrganizationToAssignable,
  PROJECT_ORGANIZATION_NONE,
} from "@/lib/organizations/assignable-organization";
import {
  updateLocalContactDetails,
  updateLocalContactOrganization,
} from "@/lib/sync/local-contact-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

type ContactOverviewDetailsFormProps = {
  contact: Contact;
  organizations: Organization[];
  onSaved?: () => void;
};

type DetailField =
  | "email"
  | "phone"
  | "title"
  | "address"
  | "city"
  | "postalCode"
  | "country"
  | "socialAccounts";

function socialAccountsKey(accounts: ContactSocialAccount[]): string {
  return JSON.stringify(accounts);
}

export function ContactOverviewDetailsForm({
  contact,
  organizations,
  onSaved,
}: ContactOverviewDetailsFormProps) {
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [title, setTitle] = useState(contact.title ?? "");
  const [address, setAddress] = useState(contact.address ?? "");
  const [city, setCity] = useState(contact.city ?? "");
  const [postalCode, setPostalCode] = useState(contact.postalCode ?? "");
  const [country, setCountry] = useState(contact.country ?? "");
  const [socialAccounts, setSocialAccounts] = useState<ContactSocialAccount[]>(
    contact.socialAccounts ?? [],
  );
  const [organizationId, setOrganizationId] = useState(
    contact.organizationId ?? "",
  );
  const [errors, setErrors] = useState<Partial<Record<DetailField, string>>>(
    {},
  );
  const [organizationError, setOrganizationError] = useState<string | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const assignableOrganizations = useMemo(
    () => organizations.map(mapOrganizationToAssignable),
    [organizations],
  );
  const organizationOptions = useOrganizationDropdownOptions(
    assignableOrganizations,
  );
  const selectedOrganization = assignableOrganizations.find(
    (organization) => organization.id === organizationId,
  );
  const organizationDropdownValue = organizationId || PROJECT_ORGANIZATION_NONE;
  const organizationTriggerLabel =
    selectedOrganization?.name ?? "No organization";

  const contactSyncKey = `${contact.id}|${contact.email ?? ""}|${contact.phone ?? ""}|${contact.title ?? ""}|${contact.address ?? ""}|${contact.city ?? ""}|${contact.postalCode ?? ""}|${contact.country ?? ""}|${socialAccountsKey(contact.socialAccounts ?? [])}|${contact.organizationId ?? ""}`;
  const [prevContactSyncKey, setPrevContactSyncKey] = useState(contactSyncKey);
  if (contactSyncKey !== prevContactSyncKey) {
    setPrevContactSyncKey(contactSyncKey);
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setTitle(contact.title ?? "");
    setAddress(contact.address ?? "");
    setCity(contact.city ?? "");
    setPostalCode(contact.postalCode ?? "");
    setCountry(contact.country ?? "");
    setSocialAccounts(contact.socialAccounts ?? []);
    setOrganizationId(contact.organizationId ?? "");
    setErrors({});
    setOrganizationError(null);
  }

  function applyTrimmed(field: Exclude<DetailField, "socialAccounts">, trimmed: string) {
    switch (field) {
      case "email":
        setEmail(trimmed);
        break;
      case "phone":
        setPhone(trimmed);
        break;
      case "title":
        setTitle(trimmed);
        break;
      case "address":
        setAddress(trimmed);
        break;
      case "city":
        setCity(trimmed);
        break;
      case "postalCode":
        setPostalCode(trimmed);
        break;
      case "country":
        setCountry(trimmed);
        break;
    }
  }

  function saveField(
    field: Exclude<DetailField, "socialAccounts">,
    nextRaw: string,
  ) {
    const trimmed = nextRaw.trim();
    const nextValue = trimmed || null;
    const currentValue = (contact[field] as string | null)?.trim() || null;

    if (nextValue === currentValue) {
      applyTrimmed(field, trimmed);
      return;
    }

    startTransition(async () => {
      setErrors((previous) => ({ ...previous, [field]: undefined }));
      const result = await runEntityPersist(
        () =>
          updateLocalContactDetails({
            contactId: contact.id,
            [field]: nextValue,
          }),
        () =>
          updateContactDetailsAction({
            contactId: contact.id,
            [field]: nextValue,
          }),
      );

      if (!result.ok) {
        setErrors((previous) => ({ ...previous, [field]: result.error }));
        return;
      }

      applyTrimmed(field, trimmed);
      onSaved?.();
    });
  }

  function saveSocialAccounts(nextAccounts: ContactSocialAccount[]) {
    const normalized = nextAccounts
      .map((entry) => ({
        platform: entry.platform.trim(),
        url: entry.url.trim(),
      }))
      .filter((entry) => entry.platform.length > 0 && entry.url.length > 0);

    if (
      socialAccountsKey(normalized) ===
      socialAccountsKey(contact.socialAccounts ?? [])
    ) {
      setSocialAccounts(normalized);
      return;
    }

    startTransition(async () => {
      setErrors((previous) => ({ ...previous, socialAccounts: undefined }));
      const result = await runEntityPersist(
        () =>
          updateLocalContactDetails({
            contactId: contact.id,
            socialAccounts: normalized,
          }),
        () =>
          updateContactDetailsAction({
            contactId: contact.id,
            socialAccounts: normalized,
          }),
      );

      if (!result.ok) {
        setErrors((previous) => ({
          ...previous,
          socialAccounts: result.error,
        }));
        return;
      }

      setSocialAccounts(normalized);
      onSaved?.();
    });
  }

  function saveOrganization(nextOrganizationId: string) {
    const normalized =
      nextOrganizationId === PROJECT_ORGANIZATION_NONE ||
      nextOrganizationId.trim().length === 0
        ? null
        : nextOrganizationId;
    const current = contact.organizationId ?? null;

    if (normalized === current) {
      setOrganizationId(normalized ?? "");
      return;
    }

    setOrganizationId(normalized ?? "");

    startTransition(async () => {
      setOrganizationError(null);
      const result = await runEntityPersist(
        () =>
          updateLocalContactOrganization({
            contactId: contact.id,
            organizationId: normalized,
          }),
        () =>
          updateContactOrganizationAction({
            contactId: contact.id,
            organizationId: normalized,
          }),
      );

      if (!result.ok) {
        setOrganizationError(result.error);
        setOrganizationId(contact.organizationId ?? "");
        return;
      }

      onSaved?.();
    });
  }

  return (
    <section
      className="flex w-full flex-col gap-4"
      aria-label="Contact details"
    >
      <OverviewDetailsField label="Email" htmlFor="contact-email" error={errors.email}>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((previous) => ({ ...previous, email: undefined }));
          }}
          onBlur={() => saveField("email", email)}
          placeholder="name@company.com"
          autoComplete="email"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="Phone" htmlFor="contact-phone" error={errors.phone}>
        <input
          id="contact-phone"
          type="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setErrors((previous) => ({ ...previous, phone: undefined }));
          }}
          onBlur={() => saveField("phone", phone)}
          placeholder="+31 6 1234 5678"
          autoComplete="tel"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="Title" htmlFor="contact-title" error={errors.title}>
        <input
          id="contact-title"
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setErrors((previous) => ({ ...previous, title: undefined }));
          }}
          onBlur={() => saveField("title", title)}
          placeholder="Role or job title"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Organization"
        error={organizationError}
      >
        <SearchableDropdown
          value={organizationDropdownValue}
          options={organizationOptions}
          onChange={saveOrganization}
          searchPlaceholder="Search organizations…"
          ariaLabel="Change organization"
          panelAlign="start"
          panelWidth="trigger"
          className="flex w-full max-w-none min-w-0"
          renderTrigger={({ open, disabled, triggerId, onToggle }) => (
            <button
              type="button"
              id={triggerId}
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Organization: ${organizationTriggerLabel}`}
              onClick={onToggle}
              className={`${overviewDetailsInputClassName} flex items-center gap-2 text-left ${
                organizationId ? "text-foreground" : "text-foreground/50"
              }`}
            >
              <span className="inline-flex size-4 shrink-0 items-center justify-center">
                {getOrganizationFallbackIcon(selectedOrganization)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {organizationTriggerLabel}
              </span>
              <span className="shrink-0 text-foreground/35" aria-hidden="true">
                ▾
              </span>
            </button>
          )}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Address"
        htmlFor="contact-address"
        error={errors.address}
      >
        <textarea
          id="contact-address"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setErrors((previous) => ({ ...previous, address: undefined }));
          }}
          onBlur={() => saveField("address", address)}
          rows={2}
          placeholder="Street and number"
          autoComplete="street-address"
          className={`${overviewDetailsInputClassName} resize-y`}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="City" htmlFor="contact-city" error={errors.city}>
        <input
          id="contact-city"
          type="text"
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
            setErrors((previous) => ({ ...previous, city: undefined }));
          }}
          onBlur={() => saveField("city", city)}
          placeholder="City"
          autoComplete="address-level2"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Postal code"
        htmlFor="contact-postal-code"
        error={errors.postalCode}
      >
        <input
          id="contact-postal-code"
          type="text"
          value={postalCode}
          onChange={(event) => {
            setPostalCode(event.target.value);
            setErrors((previous) => ({ ...previous, postalCode: undefined }));
          }}
          onBlur={() => saveField("postalCode", postalCode)}
          placeholder="1234 AB"
          autoComplete="postal-code"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Country"
        htmlFor="contact-country"
        error={errors.country}
      >
        <input
          id="contact-country"
          type="text"
          value={country}
          onChange={(event) => {
            setCountry(event.target.value);
            setErrors((previous) => ({ ...previous, country: undefined }));
          }}
          onBlur={() => saveField("country", country)}
          placeholder="Country"
          autoComplete="country-name"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="Social" error={errors.socialAccounts}>
        <ContactSocialAccountsEditor
          value={socialAccounts}
          error={null}
          onChange={setSocialAccounts}
          onSave={saveSocialAccounts}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="Notes" htmlFor="contact-notes">
        <ContactOverviewSummaryEditor
          contactId={contact.id}
          value={contact.summary ?? ""}
        />
      </OverviewDetailsField>
    </section>
  );
}
