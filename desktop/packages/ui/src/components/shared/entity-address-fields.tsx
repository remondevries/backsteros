"use client";

import { useMemo } from "react";

import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import {
  countryHasRegions,
  formatCountryLabel,
  formatRegionLabel,
  listCountries,
  listRegionsForCountry,
  resolveCountryOption,
  resolveRegionOption,
} from "../../geo/country-region.js";

export type EntityAddressValue = {
  address: string;
  city: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 when known. */
  country: string;
  region: string;
};

export type EntityAddressFieldsProps = {
  idPrefix: string;
  value: EntityAddressValue;
  disabled?: boolean;
  className?: string;
  /** Called on every field edit (controlled). */
  onChange: (next: EntityAddressValue) => void;
  /**
   * Called on text blur, and immediately when country/region changes via
   * dropdown (country change clears region).
   */
  onCommit?: (next: EntityAddressValue) => void;
};

function DropdownTriggerButton({
  label,
  muted,
  open,
  disabled,
  triggerId,
  onToggle,
  ariaLabel,
}: {
  label: string;
  muted: boolean;
  open: boolean;
  disabled?: boolean;
  triggerId: string;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      id={triggerId}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      title={label}
      onClick={onToggle}
      className={[
        "entity-overview-input",
        "entity-overview-dropdown-trigger",
        muted ? "is-muted" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="entity-overview-dropdown-trigger__label">{label}</span>
    </button>
  );
}

/**
 * Shared street / city / postal / country / region fields used by contacts,
 * organizations, and Spaces SEO. Country + region use the searchable dropdowns.
 */
export function EntityAddressFields({
  idPrefix,
  value,
  disabled = false,
  className,
  onChange,
  onCommit,
}: EntityAddressFieldsProps) {
  const { address, city, postalCode, country, region } = value;

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

  function update(patch: Partial<EntityAddressValue>) {
    onChange({ ...value, ...patch });
  }

  function commit(next: EntityAddressValue) {
    onCommit?.(next);
  }

  return (
    <div
      className={["entity-address-fields", className].filter(Boolean).join(" ")}
    >
      <label
        className="contact-location-map__field"
        htmlFor={`${idPrefix}-address`}
      >
        <span>Address</span>
        <input
          id={`${idPrefix}-address`}
          type="text"
          className="entity-overview-input"
          disabled={disabled}
          value={address}
          autoComplete="street-address"
          onChange={(event) => update({ address: event.target.value })}
          onBlur={() =>
            commit({ ...value, address: address.trim() })
          }
        />
      </label>

      <div className="contact-location-map__field-row">
        <label
          className="contact-location-map__field"
          htmlFor={`${idPrefix}-city`}
        >
          <span>City</span>
          <input
            id={`${idPrefix}-city`}
            type="text"
            className="entity-overview-input"
            disabled={disabled}
            value={city}
            autoComplete="address-level2"
            onChange={(event) => update({ city: event.target.value })}
            onBlur={() => commit({ ...value, city: city.trim() })}
          />
        </label>
        <label
          className="contact-location-map__field"
          htmlFor={`${idPrefix}-postal`}
        >
          <span>Postal code</span>
          <input
            id={`${idPrefix}-postal`}
            type="text"
            className="entity-overview-input"
            disabled={disabled}
            value={postalCode}
            autoComplete="postal-code"
            onChange={(event) => update({ postalCode: event.target.value })}
            onBlur={() =>
              commit({ ...value, postalCode: postalCode.trim() })
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
          htmlFor={`${idPrefix}-country`}
        >
          <span>Country</span>
          <SearchableDropdown
            value={countryDropdownValue}
            disabled={disabled}
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
              const nextValue = {
                ...value,
                country: nextCode,
                region: "",
              };
              onChange(nextValue);
              commit(nextValue);
            }}
            searchPlaceholder="Search countries…"
            ariaLabel="Country"
            panelAlign="start"
            panelWidth="trigger"
            className="entity-overview-dropdown"
            renderTrigger={({
              selected,
              open,
              disabled: triggerDisabled,
              triggerId,
              onToggle,
            }) => {
              const label =
                selected?.label ??
                (formatCountryLabel(country) || "No country");
              return (
                <DropdownTriggerButton
                  label={label}
                  muted={
                    !(
                      selected &&
                      selected.value !== DROPDOWN_NONE_VALUE
                    )
                  }
                  open={open}
                  disabled={triggerDisabled}
                  triggerId={triggerId}
                  onToggle={onToggle}
                  ariaLabel={`Country: ${label}`}
                />
              );
            }}
          />
        </label>

        {showRegionField ? (
          <label
            className="contact-location-map__field"
            htmlFor={`${idPrefix}-region`}
          >
            <span>State / province</span>
            <SearchableDropdown
              value={regionDropdownValue}
              disabled={disabled}
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
                        (option) => option.value !== DROPDOWN_NONE_VALUE,
                      ),
                    ]
              }
              onChange={(next) => {
                const resolved = resolveDropdownNone(next);
                const nextRegion = resolved?.trim() || "";
                const nextValue = { ...value, region: nextRegion };
                onChange(nextValue);
                commit(nextValue);
              }}
              searchPlaceholder="Search states / provinces…"
              ariaLabel="State or province"
              panelAlign="start"
              panelWidth="trigger"
              className="entity-overview-dropdown"
              renderTrigger={({
                selected,
                open,
                disabled: triggerDisabled,
                triggerId,
                onToggle,
              }) => {
                const label =
                  selected?.label ??
                  (formatRegionLabel(country, region) ||
                    "No state / province");
                return (
                  <DropdownTriggerButton
                    label={label}
                    muted={
                      !(
                        selected &&
                        selected.value !== DROPDOWN_NONE_VALUE
                      )
                    }
                    open={open}
                    disabled={triggerDisabled}
                    triggerId={triggerId}
                    onToggle={onToggle}
                    ariaLabel={`State or province: ${label}`}
                  />
                );
              }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
