"use client";

import { useState, useTransition } from "react";

import { OrganizationOverviewSummaryEditor } from "@/components/organizations/organization-overview-summary-editor";
import {
  OverviewDetailsField,
  overviewDetailsInputClassName,
} from "@/components/overview/overview-details-field";
import type { Organization } from "@/lib/db/schema";
import { updateOrganizationDetailsAction } from "@/lib/mutations/organizations";
import { updateLocalOrganizationDetails } from "@/lib/sync/local-organization-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

type OrganizationOverviewDetailsFormProps = {
  organization: Organization;
  onSaved?: () => void;
};

type DetailField =
  | "phone"
  | "email"
  | "website"
  | "address"
  | "city"
  | "postalCode"
  | "country";

export function OrganizationOverviewDetailsForm({
  organization,
  onSaved,
}: OrganizationOverviewDetailsFormProps) {
  const [phone, setPhone] = useState(organization.phone ?? "");
  const [email, setEmail] = useState(organization.email ?? "");
  const [website, setWebsite] = useState(organization.website ?? "");
  const [address, setAddress] = useState(organization.address ?? "");
  const [city, setCity] = useState(organization.city ?? "");
  const [postalCode, setPostalCode] = useState(organization.postalCode ?? "");
  const [country, setCountry] = useState(organization.country ?? "");
  const [errors, setErrors] = useState<Partial<Record<DetailField, string>>>(
    {},
  );
  const [isPending, startTransition] = useTransition();

  const organizationSyncKey = `${organization.id}|${organization.phone ?? ""}|${organization.email ?? ""}|${organization.website ?? ""}|${organization.address ?? ""}|${organization.city ?? ""}|${organization.postalCode ?? ""}|${organization.country ?? ""}`;
  const [prevOrganizationSyncKey, setPrevOrganizationSyncKey] =
    useState(organizationSyncKey);
  if (organizationSyncKey !== prevOrganizationSyncKey) {
    setPrevOrganizationSyncKey(organizationSyncKey);
    setPhone(organization.phone ?? "");
    setEmail(organization.email ?? "");
    setWebsite(organization.website ?? "");
    setAddress(organization.address ?? "");
    setCity(organization.city ?? "");
    setPostalCode(organization.postalCode ?? "");
    setCountry(organization.country ?? "");
    setErrors({});
  }

  function applyTrimmed(field: DetailField, trimmed: string) {
    switch (field) {
      case "phone":
        setPhone(trimmed);
        break;
      case "email":
        setEmail(trimmed);
        break;
      case "website":
        setWebsite(trimmed);
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

  function saveField(field: DetailField, nextRaw: string) {
    const trimmed = nextRaw.trim();
    const nextValue = trimmed || null;
    const currentValue = (organization[field] as string | null)?.trim() || null;

    if (nextValue === currentValue) {
      applyTrimmed(field, trimmed);
      return;
    }

    startTransition(async () => {
      setErrors((previous) => ({ ...previous, [field]: undefined }));
      const result = await runEntityPersist(
        () =>
          updateLocalOrganizationDetails({
            organizationId: organization.id,
            [field]: nextValue,
          }),
        () =>
          updateOrganizationDetailsAction({
            organizationId: organization.id,
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

  return (
    <section
      className="flex w-full flex-col gap-4"
      aria-label="Organization details"
    >
      <OverviewDetailsField label="Phone" htmlFor="organization-phone" error={errors.phone}>
        <input
          id="organization-phone"
          type="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setErrors((previous) => ({ ...previous, phone: undefined }));
          }}
          onBlur={() => saveField("phone", phone)}
          disabled={isPending}
          placeholder="+31 20 123 4567"
          autoComplete="tel"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="Email" htmlFor="organization-email" error={errors.email}>
        <input
          id="organization-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((previous) => ({ ...previous, email: undefined }));
          }}
          onBlur={() => saveField("email", email)}
          disabled={isPending}
          placeholder="info@company.com"
          autoComplete="email"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Website"
        htmlFor="organization-website"
        error={errors.website}
      >
        <input
          id="organization-website"
          type="url"
          value={website}
          onChange={(event) => {
            setWebsite(event.target.value);
            setErrors((previous) => ({ ...previous, website: undefined }));
          }}
          onBlur={() => saveField("website", website)}
          disabled={isPending}
          placeholder="https://company.com"
          autoComplete="url"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Address"
        htmlFor="organization-address"
        error={errors.address}
      >
        <textarea
          id="organization-address"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setErrors((previous) => ({ ...previous, address: undefined }));
          }}
          onBlur={() => saveField("address", address)}
          disabled={isPending}
          rows={2}
          placeholder="Street and number"
          autoComplete="street-address"
          className={`${overviewDetailsInputClassName} resize-y`}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="City" htmlFor="organization-city" error={errors.city}>
        <input
          id="organization-city"
          type="text"
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
            setErrors((previous) => ({ ...previous, city: undefined }));
          }}
          onBlur={() => saveField("city", city)}
          disabled={isPending}
          placeholder="City"
          autoComplete="address-level2"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Postal code"
        htmlFor="organization-postal-code"
        error={errors.postalCode}
      >
        <input
          id="organization-postal-code"
          type="text"
          value={postalCode}
          onChange={(event) => {
            setPostalCode(event.target.value);
            setErrors((previous) => ({ ...previous, postalCode: undefined }));
          }}
          onBlur={() => saveField("postalCode", postalCode)}
          disabled={isPending}
          placeholder="1234 AB"
          autoComplete="postal-code"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField
        label="Country"
        htmlFor="organization-country"
        error={errors.country}
      >
        <input
          id="organization-country"
          type="text"
          value={country}
          onChange={(event) => {
            setCountry(event.target.value);
            setErrors((previous) => ({ ...previous, country: undefined }));
          }}
          onBlur={() => saveField("country", country)}
          disabled={isPending}
          placeholder="Netherlands"
          autoComplete="country-name"
          className={overviewDetailsInputClassName}
        />
      </OverviewDetailsField>

      <OverviewDetailsField label="Notes">
        <OrganizationOverviewSummaryEditor
          organizationId={organization.id}
          value={organization.summary ?? ""}
        />
      </OverviewDetailsField>
    </section>
  );
}
