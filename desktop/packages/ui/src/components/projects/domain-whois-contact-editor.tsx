"use client";

import { useEffect, useState, type ReactNode } from "react";

import { formatCountryLabel } from "../../geo/country-region.js";
import { EntityAddressFields } from "../shared/entity-address-fields.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import type { DomainRegistrarContact } from "./domain-registrar-panel.js";

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

/** Flat chip text field — same chrome as org / contact detail values. */
function DetailTextChip({
  id,
  type = "text",
  value,
  placeholder,
  autoComplete,
  disabled,
  onChange,
  onCommit,
}: {
  id?: string;
  type?: "text" | "email" | "tel";
  value: string;
  placeholder: string;
  autoComplete?: string;
  disabled?: boolean;
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
            trimmed ? null : "is-muted",
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
            disabled={disabled}
            size={Math.max(value.length, placeholder.length, 4)}
            onChange={(event) => onChange(event.target.value)}
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

function formatWhoisRole(type: string | null | undefined): string {
  const value = type?.trim().toLowerCase() ?? "";
  if (value === "registrant" || value === "owner") return "Registrant";
  if (value === "administrative" || value === "admin") return "Administrative";
  if (value === "technical" || value === "tech") return "Technical";
  if (!value) return "Contact";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeContact(
  contact: DomainRegistrarContact,
): DomainRegistrarContact {
  return {
    type: contact.type?.trim() || null,
    firstName: emptyToNull(contact.firstName ?? ""),
    lastName: emptyToNull(contact.lastName ?? ""),
    companyName: emptyToNull(contact.companyName ?? ""),
    companyKvk: emptyToNull(contact.companyKvk ?? ""),
    companyType: emptyToNull(contact.companyType ?? ""),
    street: emptyToNull(contact.street ?? ""),
    number: emptyToNull(contact.number ?? ""),
    postalCode: emptyToNull(contact.postalCode ?? ""),
    city: emptyToNull(contact.city ?? ""),
    phoneNumber: emptyToNull(contact.phoneNumber ?? ""),
    faxNumber: emptyToNull(contact.faxNumber ?? ""),
    email: emptyToNull(contact.email ?? ""),
    country: emptyToNull(contact.country ?? "")?.toLowerCase() ?? null,
  };
}

export function contactsEqual(
  a: DomainRegistrarContact,
  b: DomainRegistrarContact,
): boolean {
  const left = normalizeContact(a);
  const right = normalizeContact(b);
  return (
    left.type === right.type &&
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.companyName === right.companyName &&
    left.companyKvk === right.companyKvk &&
    left.companyType === right.companyType &&
    left.street === right.street &&
    left.number === right.number &&
    left.postalCode === right.postalCode &&
    left.city === right.city &&
    left.phoneNumber === right.phoneNumber &&
    left.faxNumber === right.faxNumber &&
    left.email === right.email &&
    left.country === right.country
  );
}

function contactFromDraft(draft: {
  type: string | null;
  firstName: string;
  lastName: string;
  companyName: string;
  companyKvk: string;
  companyType: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  phoneNumber: string;
  faxNumber: string;
  email: string;
  country: string;
}): DomainRegistrarContact {
  return normalizeContact({
    type: draft.type,
    firstName: draft.firstName,
    lastName: draft.lastName,
    companyName: draft.companyName,
    companyKvk: draft.companyKvk,
    companyType: draft.companyType,
    street: draft.street,
    number: draft.number,
    postalCode: draft.postalCode,
    city: draft.city,
    phoneNumber: draft.phoneNumber,
    faxNumber: draft.faxNumber,
    email: draft.email,
    country: draft.country,
  });
}

export type DomainWhoisContactEditorProps = {
  contact: DomainRegistrarContact;
  contactKey: string;
  disabled?: boolean;
  onCommit: (next: DomainRegistrarContact) => void | Promise<void>;
};

/**
 * Editable WHOIS contact — same DetailsField / chip / address patterns as
 * Contacts → Details (name, email, phone, location).
 */
export function DomainWhoisContactEditor({
  contact,
  contactKey,
  disabled = false,
  onCommit,
}: DomainWhoisContactEditorProps) {
  const [firstName, setFirstName] = useState(contact.firstName ?? "");
  const [lastName, setLastName] = useState(contact.lastName ?? "");
  const [companyName, setCompanyName] = useState(contact.companyName ?? "");
  const [companyKvk, setCompanyKvk] = useState(contact.companyKvk ?? "");
  const [companyType, setCompanyType] = useState(contact.companyType ?? "");
  const [street, setStreet] = useState(contact.street ?? "");
  const [houseNumber, setHouseNumber] = useState(contact.number ?? "");
  const [postalCode, setPostalCode] = useState(contact.postalCode ?? "");
  const [city, setCity] = useState(contact.city ?? "");
  const [country, setCountry] = useState(contact.country ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [phoneNumber, setPhoneNumber] = useState(contact.phoneNumber ?? "");
  const [faxNumber, setFaxNumber] = useState(contact.faxNumber ?? "");
  const [locationEditing, setLocationEditing] = useState(false);

  useEffect(() => {
    setFirstName(contact.firstName ?? "");
    setLastName(contact.lastName ?? "");
    setCompanyName(contact.companyName ?? "");
    setCompanyKvk(contact.companyKvk ?? "");
    setCompanyType(contact.companyType ?? "");
    setStreet(contact.street ?? "");
    setHouseNumber(contact.number ?? "");
    setPostalCode(contact.postalCode ?? "");
    setCity(contact.city ?? "");
    setCountry(contact.country ?? "");
    setEmail(contact.email ?? "");
    setPhoneNumber(contact.phoneNumber ?? "");
    setFaxNumber(contact.faxNumber ?? "");
  }, [contact, contactKey]);

  const addressLine = [
    [street.trim(), houseNumber.trim()].filter(Boolean).join(" "),
    [postalCode.trim(), city.trim()].filter(Boolean).join(" "),
    formatCountryLabel(country) || country.trim().toUpperCase(),
  ]
    .filter(Boolean)
    .join(", ");

  function commit(patch: Partial<{
    firstName: string;
    lastName: string;
    companyName: string;
    companyKvk: string;
    companyType: string;
    street: string;
    number: string;
    postalCode: string;
    city: string;
    country: string;
    email: string;
    phoneNumber: string;
    faxNumber: string;
  }>) {
    if (disabled) return;
    const next = contactFromDraft({
      type: contact.type,
      firstName: patch.firstName ?? firstName,
      lastName: patch.lastName ?? lastName,
      companyName: patch.companyName ?? companyName,
      companyKvk: patch.companyKvk ?? companyKvk,
      companyType: patch.companyType ?? companyType,
      street: patch.street ?? street,
      number: patch.number ?? houseNumber,
      postalCode: patch.postalCode ?? postalCode,
      city: patch.city ?? city,
      country: patch.country ?? country,
      email: patch.email ?? email,
      phoneNumber: patch.phoneNumber ?? phoneNumber,
      faxNumber: patch.faxNumber ?? faxNumber,
    });
    if (contactsEqual(next, contact)) return;
    void onCommit(next);
  }

  const idPrefix = `whois-${contactKey}`;

  return (
    <EntityOverviewSubgroup title={`${formatWhoisRole(contact.type)} contact`}>
      <DetailsField label="First name" htmlFor={`${idPrefix}-first`}>
        <DetailTextChip
          id={`${idPrefix}-first`}
          value={firstName}
          placeholder="First name"
          autoComplete="given-name"
          disabled={disabled}
          onChange={setFirstName}
          onCommit={(next) => {
            setFirstName(next);
            commit({ firstName: next });
          }}
        />
      </DetailsField>
      <DetailsField label="Last name" htmlFor={`${idPrefix}-last`}>
        <DetailTextChip
          id={`${idPrefix}-last`}
          value={lastName}
          placeholder="Last name"
          autoComplete="family-name"
          disabled={disabled}
          onChange={setLastName}
          onCommit={(next) => {
            setLastName(next);
            commit({ lastName: next });
          }}
        />
      </DetailsField>
      <DetailsField label="Company" htmlFor={`${idPrefix}-company`}>
        <DetailTextChip
          id={`${idPrefix}-company`}
          value={companyName}
          placeholder="Company name"
          autoComplete="organization"
          disabled={disabled}
          onChange={setCompanyName}
          onCommit={(next) => {
            setCompanyName(next);
            commit({ companyName: next });
          }}
        />
      </DetailsField>
      <DetailsField label="KvK" htmlFor={`${idPrefix}-kvk`}>
        <DetailTextChip
          id={`${idPrefix}-kvk`}
          value={companyKvk}
          placeholder="Chamber of Commerce"
          disabled={disabled}
          onChange={setCompanyKvk}
          onCommit={(next) => {
            setCompanyKvk(next);
            commit({ companyKvk: next });
          }}
        />
      </DetailsField>
      <DetailsField label="Company type" htmlFor={`${idPrefix}-ctype`}>
        <DetailTextChip
          id={`${idPrefix}-ctype`}
          value={companyType}
          placeholder="e.g. BV"
          disabled={disabled}
          onChange={setCompanyType}
          onCommit={(next) => {
            setCompanyType(next);
            commit({ companyType: next });
          }}
        />
      </DetailsField>
      <DetailsField label="E-mail" htmlFor={`${idPrefix}-email`}>
        <DetailTextChip
          id={`${idPrefix}-email`}
          type="email"
          value={email}
          placeholder="email@example.com"
          autoComplete="email"
          disabled={disabled}
          onChange={setEmail}
          onCommit={(next) => {
            setEmail(next);
            commit({ email: next });
          }}
        />
      </DetailsField>
      <DetailsField label="Phone" htmlFor={`${idPrefix}-phone`}>
        <DetailTextChip
          id={`${idPrefix}-phone`}
          type="tel"
          value={phoneNumber}
          placeholder="+31 …"
          autoComplete="tel"
          disabled={disabled}
          onChange={setPhoneNumber}
          onCommit={(next) => {
            setPhoneNumber(next);
            commit({ phoneNumber: next });
          }}
        />
      </DetailsField>
      <DetailsField label="Fax" htmlFor={`${idPrefix}-fax`}>
        <DetailTextChip
          id={`${idPrefix}-fax`}
          type="tel"
          value={faxNumber}
          placeholder="Fax"
          disabled={disabled}
          onChange={setFaxNumber}
          onCommit={(next) => {
            setFaxNumber(next);
            commit({ faxNumber: next });
          }}
        />
      </DetailsField>
      <DetailsField label="Location">
        <div className="domain-whois-location">
          <div className="domain-whois-location__summary">
            <span
              className={[
                "domain-whois-location__line",
                addressLine ? null : "is-muted",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {addressLine || "Add an address"}
            </span>
            <button
              type="button"
              className="domain-overview__button"
              disabled={disabled}
              aria-expanded={locationEditing}
              onClick={() => setLocationEditing((open) => !open)}
            >
              {locationEditing ? "Done" : "Edit"}
            </button>
          </div>
          {locationEditing ? (
            <div className="domain-whois-location__editor">
              <EntityAddressFields
                idPrefix={idPrefix}
                disabled={disabled}
                value={{
                  address: street,
                  city,
                  postalCode,
                  country,
                  region: "",
                }}
                onChange={(next) => {
                  setStreet(next.address);
                  setCity(next.city);
                  setPostalCode(next.postalCode);
                  setCountry(next.country);
                }}
                onCommit={(next) => {
                  setStreet(next.address);
                  setCity(next.city);
                  setPostalCode(next.postalCode);
                  setCountry(next.country);
                  commit({
                    street: next.address,
                    city: next.city,
                    postalCode: next.postalCode,
                    country: next.country,
                  });
                }}
              />
              <DetailsField label="House number" htmlFor={`${idPrefix}-number`}>
                <DetailTextChip
                  id={`${idPrefix}-number`}
                  value={houseNumber}
                  placeholder="Number"
                  disabled={disabled}
                  onChange={setHouseNumber}
                  onCommit={(next) => {
                    setHouseNumber(next);
                    commit({ number: next });
                  }}
                />
              </DetailsField>
            </div>
          ) : null}
        </div>
      </DetailsField>
    </EntityOverviewSubgroup>
  );
}
