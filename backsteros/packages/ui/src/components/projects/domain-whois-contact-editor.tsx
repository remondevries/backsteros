"use client";

import { useEffect, useState } from "react";

import { formatCountryLabel } from "../../geo/country-region.js";
import { EntityAddressFields } from "../shared/entity-address-fields.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import type { DomainRegistrarContact } from "./domain-registrar-panel.js";

function WhoisTextField({
  id,
  label,
  type = "text",
  value,
  placeholder,
  autoComplete,
  disabled,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  type?: "text" | "email" | "tel";
  value: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onCommit: (next: string) => void;
}) {
  return (
    <label className="contact-location-map__field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        className="entity-overview-input"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
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
 * Editable WHOIS contact — stacked label/input fields matching
 * EntityAddressFields (Contacts / Organizations location editor).
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
      <div className="entity-address-fields domain-whois-fields">
        <div className="contact-location-map__field-row">
          <WhoisTextField
            id={`${idPrefix}-first`}
            label="First name"
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
          <WhoisTextField
            id={`${idPrefix}-last`}
            label="Last name"
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
        </div>
        <WhoisTextField
          id={`${idPrefix}-company`}
          label="Company"
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
        <div className="contact-location-map__field-row">
          <WhoisTextField
            id={`${idPrefix}-kvk`}
            label="KvK"
            value={companyKvk}
            placeholder="Chamber of Commerce"
            disabled={disabled}
            onChange={setCompanyKvk}
            onCommit={(next) => {
              setCompanyKvk(next);
              commit({ companyKvk: next });
            }}
          />
          <WhoisTextField
            id={`${idPrefix}-ctype`}
            label="Company type"
            value={companyType}
            placeholder="e.g. BV"
            disabled={disabled}
            onChange={setCompanyType}
            onCommit={(next) => {
              setCompanyType(next);
              commit({ companyType: next });
            }}
          />
        </div>
        <WhoisTextField
          id={`${idPrefix}-email`}
          label="E-mail"
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
        <div className="contact-location-map__field-row">
          <WhoisTextField
            id={`${idPrefix}-phone`}
            label="Phone"
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
          <WhoisTextField
            id={`${idPrefix}-fax`}
            label="Fax"
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
        </div>
        <div className="domain-whois-location">
          <div className="contact-location-map__field">
            <span>Location</span>
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
              <WhoisTextField
                id={`${idPrefix}-number`}
                label="House number"
                value={houseNumber}
                placeholder="Number"
                disabled={disabled}
                onChange={setHouseNumber}
                onCommit={(next) => {
                  setHouseNumber(next);
                  commit({ number: next });
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </EntityOverviewSubgroup>
  );
}
