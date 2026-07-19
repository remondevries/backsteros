"use client";

import { useCallback, useState, type ReactNode } from "react";

import { useTitleRenameShortcut } from "../title-rename-shortcut.js";
import { OverviewNameEditor } from "./overview-name-editor.js";

export type OrganizationOverviewDetails = {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  summary?: string | null;
};

export type OrganizationOverviewViewOrganization =
  OrganizationOverviewDetails & {
    id: string;
    name: string;
    key?: string | null;
    number?: number | null;
    displayId?: string | null;
  };

export type OrganizationOverviewViewProps = {
  organization: OrganizationOverviewViewOrganization;
  onSaveName?: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaveDetails?: (
    details: OrganizationOverviewDetails,
  ) => void | Promise<void>;
  headerAccessory?: ReactNode;
};

function DetailsField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="entity-overview-field">
      {htmlFor ? (
        <label className="entity-overview-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="entity-overview-field__label">{label}</span>
      )}
      {children}
    </div>
  );
}

/**
 * Organization overview — matches Next.js OrganizationOverviewPanel:
 * avatar/name header, then details form with Notes at the bottom.
 */
export function OrganizationOverviewView({
  organization,
  onSaveName,
  onSaveDetails,
  headerAccessory,
}: OrganizationOverviewViewProps) {
  const [name, setName] = useState(organization.name);
  const [phone, setPhone] = useState(organization.phone ?? "");
  const [email, setEmail] = useState(organization.email ?? "");
  const [website, setWebsite] = useState(organization.website ?? "");
  const [address, setAddress] = useState(organization.address ?? "");
  const [city, setCity] = useState(organization.city ?? "");
  const [postalCode, setPostalCode] = useState(organization.postalCode ?? "");
  const [country, setCountry] = useState(organization.country ?? "");
  const [summary, setSummary] = useState(organization.summary ?? "");
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);
  const [prevId, setPrevId] = useState(organization.id);

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
  );

  if (organization.id !== prevId) {
    setPrevId(organization.id);
    setName(organization.name);
    setPhone(organization.phone ?? "");
    setEmail(organization.email ?? "");
    setWebsite(organization.website ?? "");
    setAddress(organization.address ?? "");
    setCity(organization.city ?? "");
    setPostalCode(organization.postalCode ?? "");
    setCountry(organization.country ?? "");
    setSummary(organization.summary ?? "");
  }

  function persist(patch: OrganizationOverviewDetails) {
    void onSaveDetails?.(patch);
  }

  return (
    <article className="entity-overview">
      <header className="entity-overview__header">
        {headerAccessory}
        {organization.displayId ? (
          <p className="entity-overview__display-id">{organization.displayId}</p>
        ) : organization.key ? (
          <p className="entity-overview__display-id">{organization.key}</p>
        ) : null}
        <OverviewNameEditor
          value={name}
          entityLabel="Organization"
          resetKey={organization.id}
          renameFocusRequest={renameFocusRequest}
          onSave={async (next) => {
            if (!onSaveName) {
              setName(next);
              return { ok: true };
            }
            const result = await onSaveName(next);
            if (result.ok) setName(next);
            return result;
          }}
        />
      </header>

      <section
        className="entity-overview__details"
        aria-label="Organization details"
      >
        <DetailsField label="Phone" htmlFor="organization-phone">
          <input
            id="organization-phone"
            type="tel"
            className="entity-overview-input"
            value={phone}
            placeholder="+31 20 123 4567"
            autoComplete="tel"
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => persist({ phone: phone.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Email" htmlFor="organization-email">
          <input
            id="organization-email"
            type="email"
            className="entity-overview-input"
            value={email}
            placeholder="info@company.com"
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => persist({ email: email.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Website" htmlFor="organization-website">
          <input
            id="organization-website"
            type="url"
            className="entity-overview-input"
            value={website}
            placeholder="https://company.com"
            autoComplete="url"
            onChange={(event) => setWebsite(event.target.value)}
            onBlur={() => persist({ website: website.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Address" htmlFor="organization-address">
          <textarea
            id="organization-address"
            className="entity-overview-input entity-overview-input--textarea"
            value={address}
            rows={2}
            placeholder="Street and number"
            autoComplete="street-address"
            onChange={(event) => setAddress(event.target.value)}
            onBlur={() => persist({ address: address.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="City" htmlFor="organization-city">
          <input
            id="organization-city"
            type="text"
            className="entity-overview-input"
            value={city}
            placeholder="City"
            autoComplete="address-level2"
            onChange={(event) => setCity(event.target.value)}
            onBlur={() => persist({ city: city.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Postal code" htmlFor="organization-postal">
          <input
            id="organization-postal"
            type="text"
            className="entity-overview-input"
            value={postalCode}
            placeholder="1234 AB"
            autoComplete="postal-code"
            onChange={(event) => setPostalCode(event.target.value)}
            onBlur={() => persist({ postalCode: postalCode.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Country" htmlFor="organization-country">
          <input
            id="organization-country"
            type="text"
            className="entity-overview-input"
            value={country}
            placeholder="Netherlands"
            autoComplete="country-name"
            onChange={(event) => setCountry(event.target.value)}
            onBlur={() => persist({ country: country.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Notes" htmlFor="organization-notes">
          <textarea
            id="organization-notes"
            className="entity-overview-input entity-overview-input--textarea"
            value={summary}
            rows={3}
            placeholder="Add notes…"
            aria-label="Organization notes"
            onChange={(event) => setSummary(event.target.value)}
            onBlur={() => persist({ summary: summary.trim() || null })}
          />
        </DetailsField>
      </section>
    </article>
  );
}
