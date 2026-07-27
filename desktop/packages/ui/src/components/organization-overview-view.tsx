"use client";

import { useCallback, useState, type ReactNode } from "react";

import { adoptRemoteField } from "../adopt-remote-field.js";
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
  const remotePhone = organization.phone ?? "";
  const remoteEmail = organization.email ?? "";
  const remoteWebsite = organization.website ?? "";
  const remoteAddress = organization.address ?? "";
  const remoteCity = organization.city ?? "";
  const remotePostalCode = organization.postalCode ?? "";
  const remoteCountry = organization.country ?? "";
  const remoteSummary = organization.summary ?? "";

  const [name, setName] = useState(organization.name);
  const [nameSource, setNameSource] = useState(organization.name);
  const [phone, setPhone] = useState(remotePhone);
  const [phoneSource, setPhoneSource] = useState(remotePhone);
  const [email, setEmail] = useState(remoteEmail);
  const [emailSource, setEmailSource] = useState(remoteEmail);
  const [website, setWebsite] = useState(remoteWebsite);
  const [websiteSource, setWebsiteSource] = useState(remoteWebsite);
  const [address, setAddress] = useState(remoteAddress);
  const [addressSource, setAddressSource] = useState(remoteAddress);
  const [city, setCity] = useState(remoteCity);
  const [citySource, setCitySource] = useState(remoteCity);
  const [postalCode, setPostalCode] = useState(remotePostalCode);
  const [postalCodeSource, setPostalCodeSource] = useState(remotePostalCode);
  const [country, setCountry] = useState(remoteCountry);
  const [countrySource, setCountrySource] = useState(remoteCountry);
  const [summary, setSummary] = useState(remoteSummary);
  const [summarySource, setSummarySource] = useState(remoteSummary);
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
    setNameSource(organization.name);
    setPhone(remotePhone);
    setPhoneSource(remotePhone);
    setEmail(remoteEmail);
    setEmailSource(remoteEmail);
    setWebsite(remoteWebsite);
    setWebsiteSource(remoteWebsite);
    setAddress(remoteAddress);
    setAddressSource(remoteAddress);
    setCity(remoteCity);
    setCitySource(remoteCity);
    setPostalCode(remotePostalCode);
    setPostalCodeSource(remotePostalCode);
    setCountry(remoteCountry);
    setCountrySource(remoteCountry);
    setSummary(remoteSummary);
    setSummarySource(remoteSummary);
  } else {
    // Remote/synced fields changed — adopt when the local field is clean.
    adoptRemoteField(
      organization.name,
      name,
      nameSource,
      setName,
      setNameSource,
    );
    adoptRemoteField(remotePhone, phone, phoneSource, setPhone, setPhoneSource);
    adoptRemoteField(remoteEmail, email, emailSource, setEmail, setEmailSource);
    adoptRemoteField(
      remoteWebsite,
      website,
      websiteSource,
      setWebsite,
      setWebsiteSource,
    );
    adoptRemoteField(
      remoteAddress,
      address,
      addressSource,
      setAddress,
      setAddressSource,
    );
    adoptRemoteField(remoteCity, city, citySource, setCity, setCitySource);
    adoptRemoteField(
      remotePostalCode,
      postalCode,
      postalCodeSource,
      setPostalCode,
      setPostalCodeSource,
    );
    adoptRemoteField(
      remoteCountry,
      country,
      countrySource,
      setCountry,
      setCountrySource,
    );
    adoptRemoteField(
      remoteSummary,
      summary,
      summarySource,
      setSummary,
      setSummarySource,
    );
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
              setNameSource(next);
              return { ok: true };
            }
            const result = await onSaveName(next);
            if (result.ok) {
              setName(next);
              setNameSource(next);
            }
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
