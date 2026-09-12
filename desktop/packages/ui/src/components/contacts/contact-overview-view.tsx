"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GearIcon, XIcon } from "@primer/octicons-react";

import { adoptRemoteField } from "../../shared/adopt-remote-field.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { useTitleRenameShortcut } from "../../shortcuts/title-rename-shortcut.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import {
  DROPDOWN_NONE_VALUE,
  buildOrganizationDropdownOptions,
  resolveDropdownNone,
  type OrganizationDropdownItem,
} from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import {
  countryHasRegions,
  formatCountryLabel,
  formatRegionLabel,
  listCountries,
  listRegionsForCountry,
  resolveCountryOption,
  resolveRegionOption,
} from "../../geo/country-region.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { CrmGroupColorDot } from "../crm/crm-group-label.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { BirthdayCalendarIcon } from "../calendar/birthday-calendar-icon.js";
import { formatDueDateInputValue } from "../../tasks/task-due-date.js";
import {
  ContactSocialAccountsEditor,
  type ContactSocialAccount,
} from "./contact-social-accounts-editor.js";
import { ContactEmailsEditor, type ContactEmailEntry } from "./contact-emails-editor.js";
import { ContactLanguagesEditor } from "./contact-languages-editor.js";
import {
  ContactPhonesEditor,
  type ContactPhoneEntry,
} from "./contact-phones-editor.js";
import { ContactSummaryEditor } from "./contact-summary-editor.js";
import { formatBirthdayAgeLabel } from "../../contacts/birthday.js";
import {
  coerceContactLanguages,
  type ContactLanguage,
} from "@backsteros/contracts";

export type { ContactSocialAccount };
export type { ContactEmailEntry };
export type { ContactPhoneEntry };

export type ContactOverviewDetails = {
  email?: string | null;
  emails?: ContactEmailEntry[];
  phone?: string | null;
  phones?: ContactPhoneEntry[];
  title?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  /** State / province / region (ISO country–scoped). */
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  organizationId?: string | null;
  organizationName?: string | null;
  summary?: string | null;
  socialAccounts?: ContactSocialAccount[];
  /** YYYY-MM-DD; year required. */
  birthday?: string | null;
  /** Preferred languages (`nl` | `en` | `de` | `es` | `fr` | `pl`). */
  languages?: ContactLanguage[];
};

export type ContactLocationParts = {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  region?: string | null;
};

export type ContactOverviewViewContact = ContactOverviewDetails & {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  displayId?: string | null;
};

export type ContactGroupDropdownItem = {
  id: string;
  name: string;
  color?: string | null;
};

export type ContactOverviewViewProps = {
  contact: ContactOverviewViewContact;
  organizationOptions?: OrganizationDropdownItem[];
  /** Available CRM groups for the header multi-select (no create-from-query). */
  groupOptions?: ContactGroupDropdownItem[];
  memberGroupIds?: string[];
  onMemberGroupIdsChange?: (groupIds: string[]) => void;
  onSaveFirstName?: (
    firstName: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaveLastName?: (
    lastName: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  /** @deprecated Prefer onSaveFirstName / onSaveLastName. */
  onSaveName?: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaveDetails?: (details: ContactOverviewDetails) => void | Promise<void>;
  /**
   * Called after a location field blur/save with the full current location
   * parts so the host can geocode and persist lat/lng.
   */
  onAfterLocationSave?: (
    parts: ContactLocationParts,
  ) => void | Promise<void>;
  /** Object URL for a static map PNG (host fetches via authenticated API). */
  mapImageSrc?: string | null;
  mapLoading?: boolean;
  /** Muted status under the map (e.g. missing token / geocode failed). */
  mapHint?: string | null;
  onCreateOrganizationFromQuery?: (query: string) => void;
  headerAccessory?: ReactNode;
  /** Relationships list embedded in the Details tab. */
  relationshipsSlot?: ReactNode;
  /** Notes / meetings timeline under the section tabs (overview / Activity). */
  activitySlot?: ReactNode;
  /** Section tabs rendered under the avatar header (fixed; body scrolls). */
  sectionNavSlot?: ReactNode;
  /** Body for non-overview/details tabs (tasks, letters). */
  sectionBody?: ReactNode;
  /**
   * `overview` — header, tabs, activity (Activity tab).
   * `details` — header, tabs, profile fields, location + relationships.
   * `section` — header, tabs, `sectionBody`.
   */
  mode?: "overview" | "details" | "section";
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

/** Labeled rule separator + field group (same visual language as list subgroups). */
const DetailsSubgroup = EntityOverviewSubgroup;

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

function emailsKey(emails: ContactEmailEntry[]): string {
  return JSON.stringify(emails);
}

function phonesKey(phones: ContactPhoneEntry[]): string {
  return JSON.stringify(phones);
}

function languagesKey(languages: ContactLanguage[]): string {
  return JSON.stringify(languages);
}

/** One-line location from street + locality fields (skips empty parts). */
export function formatContactAddressLine(parts: {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  const street = parts.address?.trim() ?? "";
  const countryLabel = formatCountryLabel(parts.country) || parts.country?.trim() || "";
  const regionLabel =
    formatRegionLabel(parts.country, parts.region) || parts.region?.trim() || "";
  const locality = [parts.city, parts.postalCode, regionLabel, countryLabel]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(", ");
  if (street && locality) return `${street} ${locality}`;
  return street || locality;
}

/**
 * Presentational contact overview — name + details fields (no avatar upload).
 */
export function ContactOverviewView({
  contact,
  organizationOptions = [],
  groupOptions,
  memberGroupIds = [],
  onMemberGroupIdsChange,
  onSaveFirstName,
  onSaveLastName,
  onSaveName,
  onSaveDetails,
  onAfterLocationSave,
  mapImageSrc,
  mapLoading,
  mapHint,
  onCreateOrganizationFromQuery,
  headerAccessory,
  relationshipsSlot,
  activitySlot,
  sectionNavSlot,
  sectionBody,
  mode = "overview",
}: ContactOverviewViewProps) {
  const remoteEmail = contact.email ?? "";
  const remotePhone = contact.phone ?? "";
  const remoteTitle = contact.title ?? "";
  const remoteAddress = contact.address ?? "";
  const remoteCity = contact.city ?? "";
  const remotePostalCode = contact.postalCode ?? "";
  const remoteCountry = contact.country ?? "";
  const remoteRegion = contact.region ?? "";
  const remoteOrganizationId = contact.organizationId ?? "";
  const remoteSummary = contact.summary ?? "";
  const remoteSocialAccounts = contact.socialAccounts ?? [];
  const remoteEmails = contact.emails ?? [];
  const remotePhones = contact.phones ?? [];
  const remoteBirthday = contact.birthday ?? "";
  const remoteLanguages = coerceContactLanguages(contact.languages);
  const remoteFirstName =
    contact.firstName?.trim() ||
    contact.name.trim().split(/\s+/)[0] ||
    contact.name;
  const explicitLastName = contact.lastName?.trim() ?? "";
  const derivedLastName = contact.name.trim().split(/\s+/).slice(1).join(" ");
  // Empty lastName used to fall through to a derivation from `name`, which
  // duplicated the surname when firstName already stored the full display name
  // (e.g. firstName "Brandon Small" + derived "Small").
  const remoteLastName =
    explicitLastName ||
    (remoteFirstName === contact.name.trim() ||
    (derivedLastName.length > 0 &&
      remoteFirstName.endsWith(` ${derivedLastName}`))
      ? ""
      : derivedLastName);

  const [firstName, setFirstName] = useState(remoteFirstName);
  const [firstNameSource, setFirstNameSource] = useState(remoteFirstName);
  const [lastName, setLastName] = useState(remoteLastName);
  const [lastNameSource, setLastNameSource] = useState(remoteLastName);
  const [email, setEmail] = useState(remoteEmail);
  const [emailSource, setEmailSource] = useState(remoteEmail);
  const [emails, setEmails] = useState<ContactEmailEntry[]>(remoteEmails);
  const [emailsSource, setEmailsSource] = useState(emailsKey(remoteEmails));
  const [phone, setPhone] = useState(remotePhone);
  const [phoneSource, setPhoneSource] = useState(remotePhone);
  const [phones, setPhones] = useState<ContactPhoneEntry[]>(remotePhones);
  const [phonesSource, setPhonesSource] = useState(phonesKey(remotePhones));
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
  const [region, setRegion] = useState(remoteRegion);
  const [regionSource, setRegionSource] = useState(remoteRegion);
  const [locationEditing, setLocationEditing] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [organizationId, setOrganizationId] = useState(remoteOrganizationId);
  const [organizationIdSource, setOrganizationIdSource] = useState(
    remoteOrganizationId,
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState(memberGroupIds);
  const [summary, setSummary] = useState(remoteSummary);
  const [summarySource, setSummarySource] = useState(remoteSummary);
  const [socialAccounts, setSocialAccounts] = useState<ContactSocialAccount[]>(
    remoteSocialAccounts,
  );
  const [socialAccountsSource, setSocialAccountsSource] = useState(
    socialAccountsKey(remoteSocialAccounts),
  );
  const [birthday, setBirthday] = useState(remoteBirthday);
  const [birthdaySource, setBirthdaySource] = useState(remoteBirthday);
  const [languages, setLanguages] = useState<ContactLanguage[]>(remoteLanguages);
  const [languagesSource, setLanguagesSource] = useState(
    languagesKey(remoteLanguages),
  );
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);
  const [lastNameFocusRequest, setLastNameFocusRequest] = useState(0);
  const [prevId, setPrevId] = useState(contact.id);

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
  );

  useEffect(() => {
    setSelectedGroupIds(memberGroupIds);
  }, [contact.id, memberGroupIds]);

  if (contact.id !== prevId) {
    setPrevId(contact.id);
    setFirstName(remoteFirstName);
    setFirstNameSource(remoteFirstName);
    setLastName(remoteLastName);
    setLastNameSource(remoteLastName);
    setEmail(remoteEmail);
    setEmailSource(remoteEmail);
    setEmails(remoteEmails);
    setEmailsSource(emailsKey(remoteEmails));
    setPhone(remotePhone);
    setPhoneSource(remotePhone);
    setPhones(remotePhones);
    setPhonesSource(phonesKey(remotePhones));
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
    setRegion(remoteRegion);
    setRegionSource(remoteRegion);
    setLocationEditing(false);
    setMapExpanded(false);
    setOrganizationId(remoteOrganizationId);
    setOrganizationIdSource(remoteOrganizationId);
    setSelectedGroupIds(memberGroupIds);
    setSummary(remoteSummary);
    setSummarySource(remoteSummary);
    setSocialAccounts(remoteSocialAccounts);
    setSocialAccountsSource(socialAccountsKey(remoteSocialAccounts));
    setBirthday(remoteBirthday);
    setBirthdaySource(remoteBirthday);
    setLanguages(remoteLanguages);
    setLanguagesSource(languagesKey(remoteLanguages));
  } else {
    adoptRemoteField(
      remoteFirstName,
      firstName,
      firstNameSource,
      setFirstName,
      setFirstNameSource,
    );
    adoptRemoteField(
      remoteLastName,
      lastName,
      lastNameSource,
      setLastName,
      setLastNameSource,
    );
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
      remoteRegion,
      region,
      regionSource,
      setRegion,
      setRegionSource,
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
    adoptRemoteField(
      remoteBirthday,
      birthday,
      birthdaySource,
      setBirthday,
      setBirthdaySource,
    );

    const remoteSocialKey = socialAccountsKey(remoteSocialAccounts);
    if (remoteSocialKey !== socialAccountsSource) {
      setSocialAccountsSource(remoteSocialKey);
      if (socialAccountsKey(socialAccounts) === socialAccountsSource) {
        setSocialAccounts(remoteSocialAccounts);
      }
    }

    const remoteEmailsKey = emailsKey(remoteEmails);
    if (remoteEmailsKey !== emailsSource) {
      setEmailsSource(remoteEmailsKey);
      if (emailsKey(emails) === emailsSource) {
        setEmails(remoteEmails);
      }
    }

    const remotePhonesKey = phonesKey(remotePhones);
    if (remotePhonesKey !== phonesSource) {
      setPhonesSource(remotePhonesKey);
      if (phonesKey(phones) === phonesSource) {
        setPhones(remotePhones);
      }
    }

    const remoteLanguagesKey = languagesKey(remoteLanguages);
    if (remoteLanguagesKey !== languagesSource) {
      setLanguagesSource(remoteLanguagesKey);
      if (languagesKey(languages) === languagesSource) {
        setLanguages(remoteLanguages);
      }
    }
  }

  function persist(patch: ContactOverviewDetails) {
    void onSaveDetails?.(patch);
  }

  function locationPartsFromState(): ContactLocationParts {
    return {
      address: address.trim() || null,
      city: city.trim() || null,
      postalCode: postalCode.trim() || null,
      country: country.trim() || null,
      region: region.trim() || null,
    };
  }

  function persistLocation(patch: ContactOverviewDetails) {
    persist(patch);
    void onAfterLocationSave?.({
      ...locationPartsFromState(),
      ...patch,
    });
  }

  function saveEmails(next: {
    email: string | null;
    emails: ContactEmailEntry[];
  }) {
    const nextEmail = next.email ?? "";
    setEmail(nextEmail);
    setEmails(next.emails);
    const emailMatches = nextEmail === (contact.email ?? "");
    const emailsMatch =
      emailsKey(next.emails) === emailsKey(contact.emails ?? []);
    if (emailMatches && emailsMatch) {
      setEmailSource(nextEmail);
      setEmailsSource(emailsKey(next.emails));
      return;
    }
    persist({ email: next.email, emails: next.emails });
  }

  function savePhones(next: {
    phone: string | null;
    phones: ContactPhoneEntry[];
  }) {
    const nextPhone = next.phone ?? "";
    setPhone(nextPhone);
    setPhones(next.phones);
    const phoneMatches = nextPhone === (contact.phone ?? "");
    const phonesMatch =
      phonesKey(next.phones) === phonesKey(contact.phones ?? []);
    if (phoneMatches && phonesMatch) {
      setPhoneSource(nextPhone);
      setPhonesSource(phonesKey(next.phones));
      return;
    }
    persist({ phone: next.phone, phones: next.phones });
  }

  function saveSocialAccounts(nextAccounts: ContactSocialAccount[]) {
    const normalized = normalizeSocialAccounts(nextAccounts);
    setSocialAccounts(normalized);
    if (
      socialAccountsKey(normalized) ===
      socialAccountsKey(contact.socialAccounts ?? [])
    ) {
      setSocialAccountsSource(socialAccountsKey(normalized));
      return;
    }
    persist({ socialAccounts: normalized });
  }

  const addressLine = formatContactAddressLine({
    address,
    city,
    postalCode,
    region,
    country,
  });
  const birthdayAgeLabel = formatBirthdayAgeLabel(birthday);
  const countryLabel = formatCountryLabel(country) || country.trim();
  const regionLabel = formatRegionLabel(country, region) || region.trim();
  const canExpandMap = Boolean(mapImageSrc);

  useEffect(() => {
    if (!mapExpanded && !locationEditing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mapExpanded) {
        event.preventDefault();
        setMapExpanded(false);
        return;
      }
      if (locationEditing) {
        event.preventDefault();
        setLocationEditing(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locationEditing, mapExpanded]);

  const countryOptions = useMemo(
    () => [
      { value: DROPDOWN_NONE_VALUE, label: "No country" },
      ...listCountries().map((entry) => ({
        value: entry.code,
        label: entry.name,
        searchTerms: `${entry.name} ${entry.code}`,
      })),
    ],
    [],
  );
  const resolvedCountry = resolveCountryOption(country);
  const countryDropdownValue =
    resolvedCountry?.code ??
    (country.trim() ? country.trim() : DROPDOWN_NONE_VALUE);
  const regionOptions = useMemo(() => {
    const regions = listRegionsForCountry(country);
    return [
      { value: DROPDOWN_NONE_VALUE, label: "No state / province" },
      ...regions.map((entry) => ({
        value: entry.name,
        label: entry.name,
        searchTerms: `${entry.name} ${entry.code}`,
      })),
    ];
  }, [country]);
  const showRegionField = countryHasRegions(country);
  const resolvedRegion = resolveRegionOption(country, region);
  const regionDropdownValue =
    resolvedRegion?.name ??
    (region.trim() ? region.trim() : DROPDOWN_NONE_VALUE);
  const titlePart = title.trim();
  const organizationDropdownOptions = useMemo(
    () => buildOrganizationDropdownOptions(organizationOptions),
    [organizationOptions],
  );
  const groupDropdownOptions = useMemo(
    () =>
      (groupOptions ?? []).map((group) => ({
        value: group.id,
        label: group.name,
        searchTerms: group.name,
        icon: <CrmGroupColorDot color={group.color} size={10} />,
      })),
    [groupOptions],
  );
  const selectedGroupOptions = useMemo(
    () =>
      groupDropdownOptions.filter((option) =>
        selectedGroupIds.includes(option.value),
      ),
    [groupDropdownOptions, selectedGroupIds],
  );
  const groupsTriggerLabel =
    selectedGroupOptions.length === 0
      ? "No groups"
      : selectedGroupOptions.length === 1
        ? selectedGroupOptions[0]!.label
        : `${selectedGroupOptions.length} groups`;
  const groupsTriggerIcon =
    selectedGroupOptions[0]?.icon ?? (
      <CrmGroupColorDot color={null} size={10} />
    );

  const detailsFields = (
    <section className="entity-overview__details contact-details" aria-label="Contact details">
      <ContactSummaryEditor
        value={summary}
        onChange={setSummary}
        onSave={(next) => {
          setSummary(next ?? "");
          persist({ summary: next });
        }}
      />

      <DetailsSubgroup title="Personal Details">
        {relationshipsSlot ? (
          <DetailsField label="Relationships">{relationshipsSlot}</DetailsField>
        ) : null}
        <DetailsField label="Birthday">
          <div className="contact-detail-chips">
            <div className="contact-detail-chips__row contact-details-birthday">
              <TaskDueDateDropdown
                dueDate={birthday.trim() || null}
                variant="property"
                triggerVariant="inlineChip"
                labelFormat="long"
                allowClear
                noDueDateLabel="Add birthday"
                showIcon
                icon={<BirthdayCalendarIcon size={14} />}
                taskPropertyDropdownId={null}
                searchPlaceholder="e.g. 28 aug 1990…"
                searchShortcutLabel=""
                onDueDateChange={(date) => {
                  const next = date ? formatDueDateInputValue(date) : "";
                  setBirthday(next);
                  persist({ birthday: next.trim() || null });
                }}
              />
              {birthdayAgeLabel ? (
                <span className="contact-details-birthday__age">
                  {birthdayAgeLabel}
                </span>
              ) : null}
            </div>
          </div>
        </DetailsField>
        <DetailsField label="Language">
          <ContactLanguagesEditor
            key={contact.id}
            languages={languages}
            onChange={(next) => {
              setLanguages(next);
            }}
            onSave={(next) => {
              setLanguages(next);
              persist({ languages: next });
            }}
          />
        </DetailsField>
      </DetailsSubgroup>

      <DetailsSubgroup title="Contact Details">
        <DetailsField label="E-mail" htmlFor="contact-email">
          <ContactEmailsEditor
            email={email}
            emails={emails}
            onChange={({ email: nextEmail, emails: nextEmails }) => {
              setEmail(nextEmail);
              setEmails(nextEmails);
            }}
            onSave={saveEmails}
          />
        </DetailsField>
        <DetailsField label="Phone">
          <ContactPhonesEditor
            phone={phone}
            phones={phones}
            onChange={({ phone: nextPhone, phones: nextPhones }) => {
              setPhone(nextPhone);
              setPhones(nextPhones);
            }}
            onSave={savePhones}
          />
        </DetailsField>
        <DetailsField label="Social media">
          <ContactSocialAccountsEditor
            value={socialAccounts}
            onChange={setSocialAccounts}
            onSave={saveSocialAccounts}
          />
        </DetailsField>
      </DetailsSubgroup>

      <DetailsSubgroup title="Location">
        <div className="contact-location-map">
          <div
            className={[
              "contact-location-map__frame",
              canExpandMap ? "is-interactive" : null,
              locationEditing ? "is-editing" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {mapImageSrc ? (
              <img
                className="contact-location-map__image"
                src={mapImageSrc}
                alt={
                  addressLine
                    ? `Map for ${addressLine}`
                    : "Contact location map"
                }
                draggable={false}
              />
            ) : mapLoading ? (
              <div className="contact-location-map__placeholder">
                Loading map…
              </div>
            ) : (
              <div className="contact-location-map__placeholder">
                {addressLine ? "Map unavailable" : "No location yet"}
              </div>
            )}

            <button
              type="button"
              className="contact-location-map__gear"
              aria-label={
                locationEditing ? "Hide address editor" : "Edit address"
              }
              aria-expanded={locationEditing}
              title={locationEditing ? "Done" : "Edit address"}
              onClick={(event) => {
                event.stopPropagation();
                setLocationEditing((open) => !open);
              }}
            >
              <GearIcon size={14} />
            </button>

            {canExpandMap && !locationEditing ? (
              <button
                type="button"
                className="contact-location-map__expand"
                aria-label="Expand map"
                title="Expand map"
                onClick={() => setMapExpanded(true)}
              >
                <span className="contact-location-map__expand-hint">
                  Click to expand
                </span>
              </button>
            ) : null}

            <div className="contact-location-map__scrim" aria-hidden="true" />
            <div className="contact-location-map__address">
              {address.trim() ? (
                <span className="contact-location-map__address-line">
                  {address.trim()}
                </span>
              ) : null}
              {city.trim() || postalCode.trim() ? (
                <span className="contact-location-map__address-line">
                  {[city.trim(), postalCode.trim()].filter(Boolean).join(" ")}
                </span>
              ) : null}
              {regionLabel || countryLabel ? (
                <span className="contact-location-map__address-line">
                  {[regionLabel, countryLabel].filter(Boolean).join(", ")}
                </span>
              ) : null}
              {!addressLine ? (
                <span className="contact-location-map__address-line is-muted">
                  Add an address
                </span>
              ) : null}
            </div>
          </div>

          <div
            className={[
              "contact-location-map__editor",
              locationEditing ? "is-open" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            hidden={!locationEditing}
          >
            <div className="contact-location-map__editor-inner">
              <label
                className="contact-location-map__field"
                htmlFor="contact-address"
              >
                <span>Address</span>
                <input
                  id="contact-address"
                  type="text"
                  className="entity-overview-input"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  onBlur={() =>
                    persistLocation({ address: address.trim() || null })
                  }
                />
              </label>
              <div className="contact-location-map__field-row">
                <label
                  className="contact-location-map__field"
                  htmlFor="contact-city"
                >
                  <span>City</span>
                  <input
                    id="contact-city"
                    type="text"
                    className="entity-overview-input"
                    value={city}
                    autoComplete="address-level2"
                    onChange={(event) => setCity(event.target.value)}
                    onBlur={() =>
                      persistLocation({ city: city.trim() || null })
                    }
                  />
                </label>
                <label
                  className="contact-location-map__field"
                  htmlFor="contact-postal"
                >
                  <span>Postal code</span>
                  <input
                    id="contact-postal"
                    type="text"
                    className="entity-overview-input"
                    value={postalCode}
                    autoComplete="postal-code"
                    onChange={(event) => setPostalCode(event.target.value)}
                    onBlur={() =>
                      persistLocation({
                        postalCode: postalCode.trim() || null,
                      })
                    }
                  />
                </label>
              </div>
              <div
                className={[
                  "contact-location-map__field-row",
                  showRegionField ? null : "is-single",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <label
                  className="contact-location-map__field"
                  htmlFor="contact-country"
                >
                  <span>Country</span>
                  <SearchableDropdown
                    value={countryDropdownValue}
                    options={
                      resolvedCountry || !country.trim()
                        ? countryOptions
                        : [
                            {
                              value: country.trim(),
                              label: country.trim(),
                              searchTerms: country.trim(),
                            },
                            ...countryOptions.filter(
                              (option) => option.value !== DROPDOWN_NONE_VALUE,
                            ),
                          ]
                    }
                    onChange={(next) => {
                      const resolved = resolveDropdownNone(next);
                      const nextCode = resolved?.trim() || "";
                      setCountry(nextCode);
                      setRegion("");
                      persistLocation({
                        country: nextCode || null,
                        region: null,
                      });
                    }}
                    searchPlaceholder="Search countries…"
                    ariaLabel="Country"
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
                      const label =
                        selected?.label ??
                        (formatCountryLabel(country) || "No country");
                      return (
                        <button
                          type="button"
                          id={triggerId}
                          disabled={disabled}
                          aria-haspopup="listbox"
                          aria-expanded={open}
                          aria-label={`Country: ${label}`}
                          title={label}
                          onClick={onToggle}
                          className={[
                            "entity-overview-input",
                            "entity-overview-dropdown-trigger",
                            selected && selected.value !== DROPDOWN_NONE_VALUE
                              ? null
                              : "is-muted",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <span className="entity-overview-dropdown-trigger__label">
                            {label}
                          </span>
                        </button>
                      );
                    }}
                  />
                </label>
                {showRegionField ? (
                  <label
                    className="contact-location-map__field"
                    htmlFor="contact-region"
                  >
                    <span>State / province</span>
                    <SearchableDropdown
                      value={regionDropdownValue}
                      options={
                        resolvedRegion || !region.trim()
                          ? regionOptions
                          : [
                              {
                                value: region.trim(),
                                label: region.trim(),
                                searchTerms: region.trim(),
                              },
                              ...regionOptions.filter(
                                (option) =>
                                  option.value !== DROPDOWN_NONE_VALUE,
                              ),
                            ]
                      }
                      onChange={(next) => {
                        const resolved = resolveDropdownNone(next);
                        const nextRegion = resolved?.trim() || "";
                        setRegion(nextRegion);
                        persistLocation({
                          region: nextRegion || null,
                        });
                      }}
                      searchPlaceholder="Search states / provinces…"
                      ariaLabel="State or province"
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
                        const label =
                          selected?.label ??
                          (formatRegionLabel(country, region) ||
                            "No state / province");
                        return (
                          <button
                            type="button"
                            id={triggerId}
                            disabled={disabled}
                            aria-haspopup="listbox"
                            aria-expanded={open}
                            aria-label={`State or province: ${label}`}
                            title={label}
                            onClick={onToggle}
                            className={[
                              "entity-overview-input",
                              "entity-overview-dropdown-trigger",
                              selected &&
                              selected.value !== DROPDOWN_NONE_VALUE
                                ? null
                                : "is-muted",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <span className="entity-overview-dropdown-trigger__label">
                              {label}
                            </span>
                          </button>
                        );
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <div className="contact-location-map__editor-actions">
                <button
                  type="button"
                  className="contact-location-map__done"
                  onClick={() => setLocationEditing(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>

          {mapHint ? (
            <p className="contact-location-map__hint">{mapHint}</p>
          ) : null}
        </div>

        {mapExpanded && mapImageSrc
          ? createPortal(
              <div
                className="contact-location-map-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label="Expanded location map"
                onClick={() => setMapExpanded(false)}
              >
                <button
                  type="button"
                  className="contact-location-map-lightbox__close"
                  aria-label="Close expanded map"
                  onClick={() => setMapExpanded(false)}
                >
                  <XIcon size={16} />
                </button>
                <img
                  className="contact-location-map-lightbox__image"
                  src={mapImageSrc}
                  alt={
                    addressLine
                      ? `Expanded map for ${addressLine}`
                      : "Expanded contact location map"
                  }
                  onClick={(event) => event.stopPropagation()}
                />
              </div>,
              document.body,
            )
          : null}
      </DetailsSubgroup>
    </section>
  );

  return (
    <article className="entity-overview contact-overview">
      <div className="contact-overview__chrome">
      <header className="entity-overview__header contact-overview__header">
        {headerAccessory ? (
          <div className="contact-overview__avatar">{headerAccessory}</div>
        ) : null}
        <div className="contact-overview__identity">
          <div className="contact-overview__name-row">
            <OverviewNameEditor
              value={firstName}
              entityLabel="First name"
              resetKey={`${contact.id}:first`}
              renameFocusRequest={renameFocusRequest}
              fitContent
              onLeaveTitle={() => {
                setLastNameFocusRequest((count) => count + 1);
              }}
              onSave={async (next) => {
                if (!onSaveFirstName && onSaveName) {
                  const composed = [next, lastName].filter(Boolean).join(" ");
                  const result = await onSaveName(composed || next);
                  if (result.ok) {
                    // Keep source on the last confirmed remote until the patched
                    // contact lands — bumping source early lets adoptRemoteField
                    // briefly revert the field (visible flicker).
                    setFirstName(next);
                  }
                  return result;
                }
                if (!onSaveFirstName) {
                  setFirstName(next);
                  setFirstNameSource(next);
                  return { ok: true };
                }
                const result = await onSaveFirstName(next);
                if (result.ok) {
                  setFirstName(next);
                }
                return result;
              }}
            />
            <OverviewNameEditor
              value={lastName}
              entityLabel="Last name"
              resetKey={`${contact.id}:last`}
              renameFocusRequest={lastNameFocusRequest}
              allowEmpty
              fitContent
              titleClassName="contact-overview__last-name"
              onSave={async (next) => {
                if (!onSaveLastName && onSaveName) {
                  const composed = [firstName, next].filter(Boolean).join(" ");
                  if (!composed) {
                    return { ok: false, error: "First name is required." };
                  }
                  const result = await onSaveName(composed);
                  if (result.ok) {
                    setLastName(next);
                  }
                  return result;
                }
                if (!onSaveLastName) {
                  setLastName(next);
                  setLastNameSource(next);
                  return { ok: true };
                }
                const result = await onSaveLastName(next);
                if (result.ok) {
                  setLastName(next);
                }
                return result;
              }}
            />
            {groupOptions ? (
              <span className="contact-overview__groups-dropdown">
                <SearchableDropdown
                  multiple
                  values={selectedGroupIds}
                  options={groupDropdownOptions}
                  onValuesChange={(next) => {
                    setSelectedGroupIds(next);
                    onMemberGroupIdsChange?.(next);
                  }}
                  searchPlaceholder="Search groups…"
                  ariaLabel="Groups"
                  emptySelectionLabel="No groups"
                  className="property-dropdown property-dropdown--inline-chip"
                  panelAlign="end"
                  panelWidth={280}
                  renderTrigger={({
                    open,
                    disabled,
                    triggerId,
                    onToggle,
                  }) => (
                    <button
                      type="button"
                      id={triggerId}
                      disabled={disabled}
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      aria-label={`Groups: ${groupsTriggerLabel}`}
                      title={groupsTriggerLabel}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggle();
                      }}
                      className={[
                        "property-dropdown-trigger",
                        "property-dropdown-trigger--inline-chip",
                        open ? "is-open" : null,
                        selectedGroupIds.length === 0 ? "is-muted" : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span
                        className="property-dropdown-trigger__icon"
                        aria-hidden="true"
                      >
                        {groupsTriggerIcon}
                      </span>
                      <span className="property-dropdown-trigger__label">
                        {groupsTriggerLabel}
                      </span>
                    </button>
                  )}
                />
              </span>
            ) : null}
          </div>
          <div className="contact-overview__subtitle">
            <OverviewNameEditor
              value={title}
              entityLabel="Title"
              resetKey={`${contact.id}:title`}
              allowEmpty
              fitContent
              as="span"
              titleClassName="contact-overview__job-title"
              onSave={(next) => {
                const trimmed = next.trim();
                setTitle(trimmed);
                if (trimmed !== (contact.title ?? "").trim()) {
                  persist({ title: trimmed || null });
                }
                return { ok: true };
              }}
            />
            {titlePart ? (
              <span className="contact-overview__subtitle-at">at</span>
            ) : null}
            <span className="contact-overview__org-dropdown">
              <PropertyDropdown
                value={organizationId || DROPDOWN_NONE_VALUE}
                options={organizationDropdownOptions}
                onChange={(next) => {
                  const resolved = resolveDropdownNone(next) ?? "";
                  setOrganizationId(resolved);
                  persist({
                    organizationId: resolved || null,
                  });
                }}
                searchPlaceholder="Search organizations…"
                ariaLabel="Organization"
                fallbackIcon={<OrganizationIcon size={14} />}
                fallbackLabel="No organization"
                mutedFallback
                panelAlign="start"
                panelWidth={280}
                createFromQueryLabel={
                  onCreateOrganizationFromQuery
                    ? (query) =>
                        getCreateEntityFromQueryLabel("organization", query)
                    : undefined
                }
                onCreateFromQuery={onCreateOrganizationFromQuery}
              />
            </span>
          </div>
          {addressLine ? (
            <p className="contact-overview__subtitle contact-overview__subtitle--muted">
              {addressLine}
            </p>
          ) : null}
        </div>
      </header>

        {sectionNavSlot}
      </div>

      <div className="contact-overview__scroll">
        {mode === "overview" && activitySlot ? (
          <div
            id="contact-activity-feed"
            className="contact-overview__activity"
          >
            {activitySlot}
          </div>
        ) : null}

        {mode === "details" ? detailsFields : null}

        {mode === "section" && sectionBody ? (
          <div className="contact-overview__section-body">{sectionBody}</div>
        ) : null}
      </div>
    </article>
  );
}
