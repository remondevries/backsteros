"use client";

import { useCallback, useState, type ReactNode } from "react";

import { adoptRemoteField } from "../adopt-remote-field.js";
import { useTitleRenameShortcut } from "../title-rename-shortcut.js";
import {
  DROPDOWN_NONE_VALUE,
  buildOrganizationDropdownOptions,
  resolveDropdownNone,
  type OrganizationDropdownItem,
} from "./dropdown-options.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { OrganizationIcon } from "./organization-icon.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import {
  ContactSocialAccountsEditor,
  type ContactSocialAccount,
} from "./contact-social-accounts-editor.js";

export type { ContactSocialAccount };

export type ContactOverviewDetails = {
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  summary?: string | null;
  socialAccounts?: ContactSocialAccount[];
};

export type ContactOverviewViewContact = ContactOverviewDetails & {
  id: string;
  name: string;
  displayId?: string | null;
};

export type ContactOverviewViewProps = {
  contact: ContactOverviewViewContact;
  organizationOptions?: OrganizationDropdownItem[];
  onSaveName?: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaveDetails?: (details: ContactOverviewDetails) => void | Promise<void>;
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

function normalizeSocialAccounts(
  accounts: ContactSocialAccount[],
): ContactSocialAccount[] {
  return accounts
    .map((entry) => ({
      platform: entry.platform.trim(),
      url: entry.url.trim(),
    }))
    .filter((entry) => entry.platform.length > 0 && entry.url.length > 0)
    .slice(0, 20);
}

function socialAccountsKey(accounts: ContactSocialAccount[]): string {
  return JSON.stringify(accounts);
}

/**
 * Presentational contact overview — name + details fields (no avatar upload).
 */
export function ContactOverviewView({
  contact,
  organizationOptions = [],
  onSaveName,
  onSaveDetails,
  headerAccessory,
}: ContactOverviewViewProps) {
  const remoteEmail = contact.email ?? "";
  const remotePhone = contact.phone ?? "";
  const remoteTitle = contact.title ?? "";
  const remoteAddress = contact.address ?? "";
  const remoteCity = contact.city ?? "";
  const remotePostalCode = contact.postalCode ?? "";
  const remoteCountry = contact.country ?? "";
  const remoteOrganizationId = contact.organizationId ?? "";
  const remoteSummary = contact.summary ?? "";
  const remoteSocialAccounts = contact.socialAccounts ?? [];

  const [name, setName] = useState(contact.name);
  const [nameSource, setNameSource] = useState(contact.name);
  const [email, setEmail] = useState(remoteEmail);
  const [emailSource, setEmailSource] = useState(remoteEmail);
  const [phone, setPhone] = useState(remotePhone);
  const [phoneSource, setPhoneSource] = useState(remotePhone);
  const [title, setTitle] = useState(remoteTitle);
  const [titleSource, setTitleSource] = useState(remoteTitle);
  const [address, setAddress] = useState(remoteAddress);
  const [addressSource, setAddressSource] = useState(remoteAddress);
  const [city, setCity] = useState(remoteCity);
  const [citySource, setCitySource] = useState(remoteCity);
  const [postalCode, setPostalCode] = useState(remotePostalCode);
  const [postalCodeSource, setPostalCodeSource] = useState(remotePostalCode);
  const [country, setCountry] = useState(remoteCountry);
  const [countrySource, setCountrySource] = useState(remoteCountry);
  const [organizationId, setOrganizationId] = useState(remoteOrganizationId);
  const [organizationIdSource, setOrganizationIdSource] = useState(
    remoteOrganizationId,
  );
  const [summary, setSummary] = useState(remoteSummary);
  const [summarySource, setSummarySource] = useState(remoteSummary);
  const [socialAccounts, setSocialAccounts] = useState<ContactSocialAccount[]>(
    remoteSocialAccounts,
  );
  const [socialAccountsSource, setSocialAccountsSource] = useState(
    socialAccountsKey(remoteSocialAccounts),
  );
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);
  const [prevId, setPrevId] = useState(contact.id);

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
  );

  if (contact.id !== prevId) {
    setPrevId(contact.id);
    setName(contact.name);
    setNameSource(contact.name);
    setEmail(remoteEmail);
    setEmailSource(remoteEmail);
    setPhone(remotePhone);
    setPhoneSource(remotePhone);
    setTitle(remoteTitle);
    setTitleSource(remoteTitle);
    setAddress(remoteAddress);
    setAddressSource(remoteAddress);
    setCity(remoteCity);
    setCitySource(remoteCity);
    setPostalCode(remotePostalCode);
    setPostalCodeSource(remotePostalCode);
    setCountry(remoteCountry);
    setCountrySource(remoteCountry);
    setOrganizationId(remoteOrganizationId);
    setOrganizationIdSource(remoteOrganizationId);
    setSummary(remoteSummary);
    setSummarySource(remoteSummary);
    setSocialAccounts(remoteSocialAccounts);
    setSocialAccountsSource(socialAccountsKey(remoteSocialAccounts));
  } else {
    adoptRemoteField(contact.name, name, nameSource, setName, setNameSource);
    adoptRemoteField(remoteEmail, email, emailSource, setEmail, setEmailSource);
    adoptRemoteField(remotePhone, phone, phoneSource, setPhone, setPhoneSource);
    adoptRemoteField(remoteTitle, title, titleSource, setTitle, setTitleSource);
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
      remoteOrganizationId,
      organizationId,
      organizationIdSource,
      setOrganizationId,
      setOrganizationIdSource,
    );
    adoptRemoteField(
      remoteSummary,
      summary,
      summarySource,
      setSummary,
      setSummarySource,
    );

    const remoteSocialKey = socialAccountsKey(remoteSocialAccounts);
    if (remoteSocialKey !== socialAccountsSource) {
      setSocialAccountsSource(remoteSocialKey);
      if (socialAccountsKey(socialAccounts) === socialAccountsSource) {
        setSocialAccounts(remoteSocialAccounts);
      }
    }
  }

  function persist(patch: ContactOverviewDetails) {
    void onSaveDetails?.(patch);
  }

  function saveSocialAccounts(nextAccounts: ContactSocialAccount[]) {
    const normalized = normalizeSocialAccounts(nextAccounts);
    if (
      socialAccountsKey(normalized) ===
      socialAccountsKey(contact.socialAccounts ?? [])
    ) {
      setSocialAccounts(normalized);
      setSocialAccountsSource(socialAccountsKey(normalized));
      return;
    }
    setSocialAccounts(normalized);
    setSocialAccountsSource(socialAccountsKey(normalized));
    persist({ socialAccounts: normalized });
  }

  return (
    <article className="entity-overview">
      <header className="entity-overview__header">
        {headerAccessory}
        {contact.displayId ? (
          <p className="entity-overview__display-id">{contact.displayId}</p>
        ) : null}
        <OverviewNameEditor
          value={name}
          entityLabel="Contact"
          resetKey={contact.id}
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
        <input
          type="text"
          className="entity-overview__summary"
          value={summary}
          placeholder="Add a short summary…"
          aria-label="Contact summary"
          onChange={(event) => setSummary(event.target.value)}
          onBlur={() => persist({ summary: summary.trim() || null })}
        />
      </header>

      <section className="entity-overview__details" aria-label="Contact details">
        <DetailsField label="Email" htmlFor="contact-email">
          <input
            id="contact-email"
            type="email"
            className="entity-overview-input"
            value={email}
            placeholder="name@example.com"
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => persist({ email: email.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Phone" htmlFor="contact-phone">
          <input
            id="contact-phone"
            type="tel"
            className="entity-overview-input"
            value={phone}
            placeholder="+31 …"
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => persist({ phone: phone.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Title" htmlFor="contact-title">
          <input
            id="contact-title"
            type="text"
            className="entity-overview-input"
            value={title}
            placeholder="Role or title"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => persist({ title: title.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Organization" htmlFor="contact-organization">
          <SearchableDropdown
            value={organizationId || DROPDOWN_NONE_VALUE}
            options={buildOrganizationDropdownOptions(organizationOptions)}
            onChange={(next) => {
              const resolved = resolveDropdownNone(next) ?? "";
              setOrganizationId(resolved);
              setOrganizationIdSource(resolved);
              const org = organizationOptions.find(
                (entry) => entry.id === resolved,
              );
              persist({
                organizationId: resolved || null,
                organizationName: org?.name ?? null,
              });
            }}
            searchPlaceholder="Search organizations…"
            ariaLabel="Organization"
            panelAlign="start"
            panelWidth="trigger"
            className="entity-overview-dropdown"
            renderTrigger={({
              selected,
              open,
              disabled,
              triggerId,
              onToggle,
            }) => {
              const label = selected?.label ?? "No organization";
              return (
                <button
                  type="button"
                  id={triggerId}
                  disabled={disabled}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  aria-label={`Organization: ${label}`}
                  title={label}
                  onClick={onToggle}
                  className={[
                    "entity-overview-input",
                    "entity-overview-dropdown-trigger",
                    selected ? null : "is-muted",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span
                    className="entity-overview-dropdown-trigger__icon"
                    aria-hidden="true"
                  >
                    {selected?.icon ?? <OrganizationIcon size={14} />}
                  </span>
                  <span className="entity-overview-dropdown-trigger__label">
                    {label}
                  </span>
                  <span
                    className="entity-overview-dropdown-trigger__chevron"
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>
              );
            }}
          />
        </DetailsField>
        <DetailsField label="Address" htmlFor="contact-address">
          <input
            id="contact-address"
            type="text"
            className="entity-overview-input"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onBlur={() => persist({ address: address.trim() || null })}
          />
        </DetailsField>
        <div className="entity-overview-field-row">
          <DetailsField label="City" htmlFor="contact-city">
            <input
              id="contact-city"
              type="text"
              className="entity-overview-input"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              onBlur={() => persist({ city: city.trim() || null })}
            />
          </DetailsField>
          <DetailsField label="Postal code" htmlFor="contact-postal">
            <input
              id="contact-postal"
              type="text"
              className="entity-overview-input"
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              onBlur={() => persist({ postalCode: postalCode.trim() || null })}
            />
          </DetailsField>
        </div>
        <DetailsField label="Country" htmlFor="contact-country">
          <input
            id="contact-country"
            type="text"
            className="entity-overview-input"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            onBlur={() => persist({ country: country.trim() || null })}
          />
        </DetailsField>
        <DetailsField label="Social">
          <ContactSocialAccountsEditor
            value={socialAccounts}
            onChange={setSocialAccounts}
            onSave={saveSocialAccounts}
          />
        </DetailsField>
      </section>
    </article>
  );
}
