"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GearIcon, XIcon } from "@primer/octicons-react";

import { adoptRemoteField } from "../../shared/adopt-remote-field.js";
import { useTitleRenameShortcut } from "../../shortcuts/title-rename-shortcut.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
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
import {
  ContactSocialAccountsEditor,
  type ContactSocialAccount,
} from "../contacts/contact-social-accounts-editor.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import { ContactEmailsEditor } from "../contacts/contact-emails-editor.js";
import { ContactPhonesEditor } from "../contacts/contact-phones-editor.js";
import { ContactSummaryEditor } from "../contacts/contact-summary-editor.js";
import { formatContactAddressLine } from "../contacts/contact-overview-view.js";
import {
  ORGANIZATION_CONTACT_LABEL_OPTIONS,
  coerceOrganizationEmailEntries,
  coerceOrganizationPhoneEntries,
  normalizeOrganizationContactLabel,
  normalizeOrganizationEmailsInput,
  normalizeOrganizationPhonesInput,
  organizationEmailRowsForEditor,
  organizationPhoneRowsForEditor,
  splitOrganizationEmailRows,
  splitOrganizationPhoneRows,
  type OrganizationEmailEntry,
  type OrganizationPhoneEntry,
} from "@backsteros/contracts";
import type { ContactEmailEditorRow } from "../contacts/contact-emails-editor.js";
import type { ContactPhoneEditorRow } from "../contacts/contact-phones-editor.js";

/** Editor rows carry free-form labels; narrow to org labels before splitting. */
function splitOrganizationEmailEditorRows(rows: ContactEmailEditorRow[]) {
  return splitOrganizationEmailRows(
    rows.map((row) => ({
      label: normalizeOrganizationContactLabel(row.label),
      address: row.address,
    })),
  );
}

function splitOrganizationPhoneEditorRows(rows: ContactPhoneEditorRow[]) {
  return splitOrganizationPhoneRows(
    rows.map((row) => ({
      label: normalizeOrganizationContactLabel(row.label),
      number: row.number,
    })),
  );
}

/** Canonical company-size buckets stored on `organizations.size`. */
export const ORGANIZATION_SIZE_OPTIONS = [
  "1 - 5",
  "5 - 15",
  "15 - 50",
  "50 - 150",
  "150 - 500",
  "500+",
] as const;

export type OrganizationSizeOption = (typeof ORGANIZATION_SIZE_OPTIONS)[number];

export type OrganizationOverviewDetails = {
  phone?: string | null;
  email?: string | null;
  emails?: OrganizationEmailEntry[];
  phones?: OrganizationPhoneEntry[];
  website?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  summary?: string | null;
  moneybirdContactId?: string | null;
  size?: string | null;
  socialAccounts?: ContactSocialAccount[];
  chamberOfCommerce?: string | null;
  taxNumber?: string | null;
};

export type OrganizationLocationParts = {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  region?: string | null;
};

export type OrganizationOverviewViewOrganization =
  OrganizationOverviewDetails & {
    id: string;
    name: string;
    key?: string | null;
    number?: number | null;
    displayId?: string | null;
  };

export type OrganizationGroupDropdownItem = {
  id: string;
  name: string;
  color?: string | null;
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
  /**
   * Called after a location field blur/save with the full current location
   * parts so the host can geocode and persist lat/lng.
   */
  onAfterLocationSave?: (
    parts: OrganizationLocationParts,
  ) => void | Promise<void>;
  /** Object URL for a static map PNG (host fetches via authenticated API). */
  mapImageSrc?: string | null;
  mapLoading?: boolean;
  /** Muted status under the map (e.g. missing token / geocode failed). */
  mapHint?: string | null;
  /** External Moneybird contact URL; when set, Details shows “Open in Moneybird”. */
  moneybirdHref?: string | null;
  headerAccessory?: ReactNode;
  /** Available CRM groups for the header multi-select. */
  groupOptions?: OrganizationGroupDropdownItem[];
  memberGroupIds?: string[];
  onMemberGroupIdsChange?: (groupIds: string[]) => void;
  /** Notes / meetings timeline under the section tabs (Activity tab). */
  activitySlot?: ReactNode;
  /** Section tabs rendered under the avatar header (fixed; body scrolls). */
  sectionNavSlot?: ReactNode;
  /** Body for non-overview/details tabs (projects, contacts, …). */
  sectionBody?: ReactNode;
  /**
   * `overview` — header, tabs, activity (Activity tab).
   * `details` — header, tabs, profile fields.
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

function emailsKey(entries: OrganizationEmailEntry[]): string {
  return JSON.stringify(entries);
}

function phonesKey(entries: OrganizationPhoneEntry[]): string {
  return JSON.stringify(entries);
}

function normalizeOrganizationWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === "https://" ||
    trimmed === "http://" ||
    trimmed === "//"
  ) {
    return "";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/** Flat chip text field — same chrome as contact email/phone values. */
function DetailTextChip({
  id,
  type = "text",
  value,
  placeholder,
  autoComplete,
  ensureHttpsPrefix = false,
  onChange,
  onCommit,
}: {
  id?: string;
  type?: "text" | "email" | "tel" | "url";
  value: string;
  placeholder: string;
  autoComplete?: string;
  /** When empty, focus inserts `https://` so the user only types the host. */
  ensureHttpsPrefix?: boolean;
  onChange: (next: string) => void;
  onCommit: (next: string) => void;
}) {
  const trimmed = value.trim();
  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        <div
          className={[
            "contact-detail-split-chip",
            trimmed && trimmed !== "https://" ? null : "is-muted",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <input
            id={id}
            type={type}
            className="contact-detail-split-chip__value"
            value={value}
            placeholder={placeholder}
            autoComplete={autoComplete}
            size={Math.max(value.length, placeholder.length, 4)}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => {
              if (!ensureHttpsPrefix) return;
              if (event.target.value.trim()) return;
              onChange("https://");
              // Place caret after the prefix on the next paint.
              requestAnimationFrame(() => {
                const input = event.target;
                const end = input.value.length;
                input.setSelectionRange(end, end);
              });
            }}
            onBlur={(event) => onCommit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Read-only value chip — shrink-wraps content (no split-chip min-width). */
function DetailValueChip({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        <span
          className={[
            "contact-detail-chip",
            "contact-detail-chip--static",
            muted ? "is-muted" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </span>
      </div>
    </div>
  );
}

/**
 * Organization overview — same card chrome as contacts: avatar/name header,
 * section tabs, then a scrolling body (Activity / Details / section).
 */
export function OrganizationOverviewView({
  organization,
  onSaveName,
  onSaveDetails,
  onAfterLocationSave,
  mapImageSrc,
  mapLoading,
  mapHint,
  moneybirdHref,
  headerAccessory,
  groupOptions,
  memberGroupIds = [],
  onMemberGroupIdsChange,
  activitySlot,
  sectionNavSlot,
  sectionBody,
  mode = "overview",
}: OrganizationOverviewViewProps) {
  const remotePhone = organization.phone ?? "";
  const remoteEmail = organization.email ?? "";
  const remoteEmails = coerceOrganizationEmailEntries(organization.emails);
  const remotePhones = coerceOrganizationPhoneEntries(organization.phones);
  const remoteWebsite = organization.website ?? "";
  const remoteAddress = organization.address ?? "";
  const remoteCity = organization.city ?? "";
  const remotePostalCode = organization.postalCode ?? "";
  const remoteCountry = organization.country ?? "";
  const remoteRegion = organization.region ?? "";
  const remoteSummary = organization.summary ?? "";
  const remoteSize = organization.size ?? "";
  const remoteSocialAccounts = organization.socialAccounts ?? [];
  const remoteChamberOfCommerce = organization.chamberOfCommerce ?? "";
  const remoteTaxNumber = organization.taxNumber ?? "";

  const [name, setName] = useState(organization.name);
  const [nameSource, setNameSource] = useState(organization.name);
  const [phone, setPhone] = useState(remotePhone);
  const [phoneSource, setPhoneSource] = useState(remotePhone);
  const [phones, setPhones] = useState<OrganizationPhoneEntry[]>(remotePhones);
  const [phonesSource, setPhonesSource] = useState(phonesKey(remotePhones));
  const [email, setEmail] = useState(remoteEmail);
  const [emailSource, setEmailSource] = useState(remoteEmail);
  const [emails, setEmails] = useState<OrganizationEmailEntry[]>(remoteEmails);
  const [emailsSource, setEmailsSource] = useState(emailsKey(remoteEmails));
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
  const [region, setRegion] = useState(remoteRegion);
  const [regionSource, setRegionSource] = useState(remoteRegion);
  const [locationEditing, setLocationEditing] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [summary, setSummary] = useState(remoteSummary);
  const [summarySource, setSummarySource] = useState(remoteSummary);
  const [size, setSize] = useState(remoteSize);
  const [sizeSource, setSizeSource] = useState(remoteSize);
  const [socialAccounts, setSocialAccounts] = useState<ContactSocialAccount[]>(
    remoteSocialAccounts,
  );
  const [socialAccountsSource, setSocialAccountsSource] = useState(
    socialAccountsKey(remoteSocialAccounts),
  );
  const [chamberOfCommerce, setChamberOfCommerce] = useState(
    remoteChamberOfCommerce,
  );
  const [chamberOfCommerceSource, setChamberOfCommerceSource] = useState(
    remoteChamberOfCommerce,
  );
  const [taxNumber, setTaxNumber] = useState(remoteTaxNumber);
  const [taxNumberSource, setTaxNumberSource] = useState(remoteTaxNumber);
  const [selectedGroupIds, setSelectedGroupIds] = useState(memberGroupIds);
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);
  const [prevId, setPrevId] = useState(organization.id);

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
  );

  useEffect(() => {
    setSelectedGroupIds(memberGroupIds);
  }, [organization.id, memberGroupIds]);

  if (organization.id !== prevId) {
    setPrevId(organization.id);
    setName(organization.name);
    setNameSource(organization.name);
    setPhone(remotePhone);
    setPhoneSource(remotePhone);
    setPhones(remotePhones);
    setPhonesSource(phonesKey(remotePhones));
    setEmail(remoteEmail);
    setEmailSource(remoteEmail);
    setEmails(remoteEmails);
    setEmailsSource(emailsKey(remoteEmails));
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
    setRegion(remoteRegion);
    setRegionSource(remoteRegion);
    setLocationEditing(false);
    setMapExpanded(false);
    setSummary(remoteSummary);
    setSummarySource(remoteSummary);
    setSize(remoteSize);
    setSizeSource(remoteSize);
    setSocialAccounts(remoteSocialAccounts);
    setSocialAccountsSource(socialAccountsKey(remoteSocialAccounts));
    setChamberOfCommerce(remoteChamberOfCommerce);
    setChamberOfCommerceSource(remoteChamberOfCommerce);
    setTaxNumber(remoteTaxNumber);
    setTaxNumberSource(remoteTaxNumber);
    setSelectedGroupIds(memberGroupIds);
  } else {
    adoptRemoteField(
      organization.name,
      name,
      nameSource,
      setName,
      setNameSource,
    );
    adoptRemoteField(remotePhone, phone, phoneSource, setPhone, setPhoneSource);
    adoptRemoteField(remoteEmail, email, emailSource, setEmail, setEmailSource);
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
      remoteRegion,
      region,
      regionSource,
      setRegion,
      setRegionSource,
    );
    adoptRemoteField(
      remoteSummary,
      summary,
      summarySource,
      setSummary,
      setSummarySource,
    );
    adoptRemoteField(remoteSize, size, sizeSource, setSize, setSizeSource);
    adoptRemoteField(
      remoteChamberOfCommerce,
      chamberOfCommerce,
      chamberOfCommerceSource,
      setChamberOfCommerce,
      setChamberOfCommerceSource,
    );
    adoptRemoteField(
      remoteTaxNumber,
      taxNumber,
      taxNumberSource,
      setTaxNumber,
      setTaxNumberSource,
    );

    const remoteSocialKey = socialAccountsKey(remoteSocialAccounts);
    if (remoteSocialKey !== socialAccountsSource) {
      setSocialAccountsSource(remoteSocialKey);
      if (socialAccountsKey(socialAccounts) === socialAccountsSource) {
        setSocialAccounts(remoteSocialAccounts);
      }
    }
  }

  function persist(patch: OrganizationOverviewDetails) {
    void onSaveDetails?.(patch);
  }

  function locationPartsFromState(): OrganizationLocationParts {
    return {
      address: address.trim() || null,
      city: city.trim() || null,
      postalCode: postalCode.trim() || null,
      country: country.trim() || null,
      region: region.trim() || null,
    };
  }

  function persistLocation(patch: OrganizationOverviewDetails) {
    persist(patch);
    void onAfterLocationSave?.({
      ...locationPartsFromState(),
      ...patch,
    });
  }

  function saveSocialAccounts(nextAccounts: ContactSocialAccount[]) {
    const normalized = normalizeSocialAccounts(nextAccounts);
    setSocialAccounts(normalized);
    if (
      socialAccountsKey(normalized) ===
      socialAccountsKey(organization.socialAccounts ?? [])
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
  const countryLabel = formatCountryLabel(country) || country.trim();
  const regionLabel = formatRegionLabel(country, region) || region.trim();
  const canExpandMap = Boolean(mapImageSrc);
  const chamberOfCommerceDisplay = chamberOfCommerce.trim();
  const taxNumberDisplay = taxNumber.trim();

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
  const sizeOptions = useMemo(() => {
    const known = new Set<string>(ORGANIZATION_SIZE_OPTIONS);
    const trimmed = size.trim();
    const options: SearchableDropdownOption[] = [
      { value: DROPDOWN_NONE_VALUE, label: "No size" },
      ...ORGANIZATION_SIZE_OPTIONS.map((value) => ({
        value,
        label: value,
        searchTerms: value,
      })),
    ];
    if (trimmed && !known.has(trimmed)) {
      options.splice(1, 0, {
        value: trimmed,
        label: trimmed,
        searchTerms: trimmed,
      });
    }
    return options;
  }, [size]);
  const sizeDropdownValue = size.trim()
    ? size.trim()
    : DROPDOWN_NONE_VALUE;
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
    <section
      className="entity-overview__details contact-details"
      aria-label="Organization details"
    >
      <ContactSummaryEditor
        value={summary}
        onChange={setSummary}
        onSave={(next) => {
          setSummary(next ?? "");
          persist({ summary: next });
        }}
      />

      <DetailsSubgroup title="Company details">
        <DetailsField label="Website" htmlFor="organization-website">
          <DetailTextChip
            id="organization-website"
            type="url"
            value={website}
            placeholder="https://"
            autoComplete="url"
            ensureHttpsPrefix
            onChange={setWebsite}
            onCommit={(next) => {
              const normalized = normalizeOrganizationWebsite(next);
              setWebsite(normalized);
              persist({ website: normalized || null });
            }}
          />
        </DetailsField>
        {chamberOfCommerceDisplay ? (
          <DetailsField label="Chamber of Commerce">
            <DetailValueChip>{chamberOfCommerceDisplay}</DetailValueChip>
          </DetailsField>
        ) : null}
        {taxNumberDisplay ? (
          <DetailsField label="VAT Number">
            <DetailValueChip>{taxNumberDisplay}</DetailValueChip>
          </DetailsField>
        ) : null}
        <DetailsField label="Size">
          <div className="contact-detail-chips">
            <div className="contact-detail-chips__row">
              <SearchableDropdown
                value={sizeDropdownValue}
                options={sizeOptions}
                onChange={(next) => {
                  const resolved = resolveDropdownNone(next);
                  const nextSize = resolved?.trim() || "";
                  setSize(nextSize);
                  persist({ size: nextSize || null });
                }}
                searchPlaceholder="Search size…"
                searchShortcutLabel=""
                ariaLabel="Company size"
                panelAlign="start"
                panelWidth="trigger"
                showIcon={false}
                className="contact-detail-size-dropdown"
                renderTrigger={({
                  selected,
                  open,
                  disabled,
                  triggerId,
                  onToggle,
                }) => {
                  const label =
                    selected?.label ??
                    (size.trim() || "Add size");
                  const hasValue =
                    selected != null &&
                    selected.value !== DROPDOWN_NONE_VALUE;
                  return (
                    <button
                      type="button"
                      id={triggerId}
                      disabled={disabled}
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      aria-label={`Company size: ${label}`}
                      title={label}
                      onClick={onToggle}
                      className={[
                        "contact-detail-chip",
                        hasValue ? null : "is-muted",
                        open ? "is-open" : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {label}
                    </button>
                  );
                }}
              />
            </div>
          </div>
        </DetailsField>
        {moneybirdHref ? (
          <DetailsField label="Moneybird">
            <div className="contact-detail-chips">
              <div className="contact-detail-chips__row">
                <a
                  className="contact-detail-chip"
                  href={moneybirdHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Moneybird
                </a>
              </div>
            </div>
          </DetailsField>
        ) : null}
      </DetailsSubgroup>

      <DetailsSubgroup title="Contact details">
        <DetailsField label="E-mail" htmlFor="organization-email">
          <ContactEmailsEditor
            email={email}
            emails={emails}
            labelOptions={ORGANIZATION_CONTACT_LABEL_OPTIONS}
            defaultLabel="general"
            rowsForEditor={organizationEmailRowsForEditor}
            splitRows={splitOrganizationEmailEditorRows}
            onChange={({ email: nextEmail, emails: nextEmails }) => {
              setEmail(nextEmail);
              setEmails(
                coerceOrganizationEmailEntries(nextEmails),
              );
            }}
            onSave={({ email: nextEmail, emails: nextEmails }) => {
              const normalized = normalizeOrganizationEmailsInput({
                email: nextEmail,
                emails: nextEmails,
              });
              const nextEmailValue = normalized.email ?? "";
              setEmail(nextEmailValue);
              setEmails(normalized.emails);
              const emailMatches =
                nextEmailValue === (organization.email ?? "");
              const emailsMatch =
                emailsKey(normalized.emails) ===
                emailsKey(organization.emails ?? []);
              if (emailMatches && emailsMatch) {
                setEmailSource(nextEmailValue);
                setEmailsSource(emailsKey(normalized.emails));
                return;
              }
              persist({
                email: normalized.email,
                emails: normalized.emails,
              });
            }}
          />
        </DetailsField>
        <DetailsField label="Phone">
          <ContactPhonesEditor
            phone={phone}
            phones={phones}
            labelOptions={ORGANIZATION_CONTACT_LABEL_OPTIONS}
            defaultLabel="general"
            rowsForEditor={organizationPhoneRowsForEditor}
            splitRows={splitOrganizationPhoneEditorRows}
            onChange={({ phone: nextPhone, phones: nextPhones }) => {
              setPhone(nextPhone);
              setPhones(coerceOrganizationPhoneEntries(nextPhones));
            }}
            onSave={({ phone: nextPhone, phones: nextPhones }) => {
              const normalized = normalizeOrganizationPhonesInput({
                phone: nextPhone,
                phones: nextPhones,
              });
              const nextPhoneValue = normalized.phone ?? "";
              setPhone(nextPhoneValue);
              setPhones(normalized.phones);
              const phoneMatches =
                nextPhoneValue === (organization.phone ?? "");
              const phonesMatch =
                phonesKey(normalized.phones) ===
                phonesKey(organization.phones ?? []);
              if (phoneMatches && phonesMatch) {
                setPhoneSource(nextPhoneValue);
                setPhonesSource(phonesKey(normalized.phones));
                return;
              }
              persist({
                phone: normalized.phone,
                phones: normalized.phones,
              });
            }}
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
                    : "Organization location map"
                }
                draggable={false}
              />
            ) : mapLoading ? (
              <div className="contact-location-map__placeholder">
                Loading map…
              </div>
            ) : (
              <div className="contact-location-map__placeholder">
                {mapHint === "Locating address…"
                  ? "Locating address…"
                  : addressLine
                    ? "Map unavailable"
                    : "No location yet"}
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
                htmlFor="organization-address"
              >
                <span>Address</span>
                <input
                  id="organization-address"
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
                  htmlFor="organization-city"
                >
                  <span>City</span>
                  <input
                    id="organization-city"
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
                  htmlFor="organization-postal"
                >
                  <span>Postal code</span>
                  <input
                    id="organization-postal"
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
                  htmlFor="organization-country"
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
                    htmlFor="organization-region"
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
                      : "Expanded organization location map"
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
    <article className="entity-overview organization-overview">
      <div className="organization-overview__chrome">
        <header className="entity-overview__header organization-overview__header">
          {headerAccessory ? (
            <div className="organization-overview__avatar">{headerAccessory}</div>
          ) : null}
          <div className="organization-overview__identity">
            <div className="organization-overview__name-row">
              <OverviewNameEditor
                value={name}
                entityLabel="Organization"
                resetKey={organization.id}
                renameFocusRequest={renameFocusRequest}
                fitContent
                onSave={async (next) => {
                  if (!onSaveName) {
                    setName(next);
                    setNameSource(next);
                    return { ok: true };
                  }
                  const result = await onSaveName(next);
                  if (result.ok) {
                    // Keep source on the last confirmed remote until the patched
                    // organization lands — bumping source early lets
                    // adoptRemoteField briefly revert the field.
                    setName(next);
                  }
                  return result;
                }}
              />
              {groupOptions ? (
                <span className="organization-overview__groups-dropdown">
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
            {organization.displayId || organization.key ? (
              <p className="entity-overview__display-id">
                {organization.displayId ?? organization.key}
              </p>
            ) : null}
            {addressLine ? (
              <p className="organization-overview__subtitle organization-overview__subtitle--muted">
                {addressLine}
              </p>
            ) : null}
          </div>
        </header>

        {sectionNavSlot}
      </div>

      <div className="organization-overview__scroll">
        {mode === "overview" && activitySlot ? (
          <div
            id="organization-activity-feed"
            className="organization-overview__activity"
          >
            {activitySlot}
          </div>
        ) : null}

        {mode === "details" ? detailsFields : null}

        {mode === "section" && sectionBody ? (
          <div className="organization-overview__section-body">
            {sectionBody}
          </div>
        ) : null}
      </div>
    </article>
  );
}
