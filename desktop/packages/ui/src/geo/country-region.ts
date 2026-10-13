import { allCountries } from "country-region-data";

export type CountryOption = {
  /** ISO 3166-1 alpha-2 */
  code: string;
  name: string;
};

export type RegionOption = {
  /** Region short code when available (e.g. US state, NL province). */
  code: string;
  name: string;
};

/** Package shape: [countryName, countryShortCode, [regionName, regionShortCode][]] */
type CountryDataTuple = [
  string,
  string,
  Array<[string, string] | [string]>,
];

const DATA = allCountries as CountryDataTuple[];

const COUNTRIES: CountryOption[] = DATA.map((entry) => ({
  code: entry[1].toUpperCase(),
  name: entry[0],
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

const COUNTRY_BY_CODE = new Map(
  COUNTRIES.map((country) => [country.code, country]),
);

const COUNTRY_BY_NAME = new Map(
  COUNTRIES.map((country) => [normalizeKey(country.name), country]),
);

/** Common free-text aliases → ISO code (legacy contact.country values). */
const COUNTRY_ALIASES: Record<string, string> = {
  netherlands: "NL",
  "the netherlands": "NL",
  holland: "NL",
  nederland: "NL",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  america: "US",
  "united kingdom": "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  uk: "GB",
  "u.k.": "GB",
};

const REGIONS_BY_COUNTRY = new Map<string, RegionOption[]>(
  DATA.map((entry) => {
    const code = entry[1].toUpperCase();
    const regions = entry[2]
      .map((region) => {
        const name = String(region[0] ?? "").trim();
        const shortCode = String(region[1] ?? name).trim();
        return { code: shortCode || name, name };
      })
      .filter((region) => region.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    return [code, regions] as const;
  }),
);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function listCountries(): CountryOption[] {
  return COUNTRIES;
}

export function getCountryByCode(
  code: string | null | undefined,
): CountryOption | null {
  if (!code?.trim()) return null;
  return COUNTRY_BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/**
 * Resolve a stored country value (ISO code or legacy free-text name) to an
 * ISO option when possible.
 */
export function resolveCountryOption(
  value: string | null | undefined,
): CountryOption | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const byCode = COUNTRY_BY_CODE.get(trimmed.toUpperCase());
  if (byCode) return byCode;
  const alias = COUNTRY_ALIASES[normalizeKey(trimmed)];
  if (alias) return COUNTRY_BY_CODE.get(alias) ?? null;
  return COUNTRY_BY_NAME.get(normalizeKey(trimmed)) ?? null;
}

/** Display label for stored country (ISO → English name, else raw). */
export function formatCountryLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return resolveCountryOption(value)?.name ?? value.trim();
}

export function listRegionsForCountry(
  countryCodeOrName: string | null | undefined,
): RegionOption[] {
  const country = resolveCountryOption(countryCodeOrName);
  if (!country) return [];
  return REGIONS_BY_COUNTRY.get(country.code) ?? [];
}

export function countryHasRegions(
  countryCodeOrName: string | null | undefined,
): boolean {
  return listRegionsForCountry(countryCodeOrName).length > 0;
}

/**
 * Resolve a stored region value to a known region for the country, matching
 * by code or name (case-insensitive).
 */
export function resolveRegionOption(
  countryCodeOrName: string | null | undefined,
  regionValue: string | null | undefined,
): RegionOption | null {
  if (!regionValue?.trim()) return null;
  const regions = listRegionsForCountry(countryCodeOrName);
  const key = normalizeKey(regionValue);
  return (
    regions.find(
      (region) =>
        normalizeKey(region.code) === key || normalizeKey(region.name) === key,
    ) ?? null
  );
}

export function formatRegionLabel(
  countryCodeOrName: string | null | undefined,
  regionValue: string | null | undefined,
): string {
  if (!regionValue?.trim()) return "";
  return (
    resolveRegionOption(countryCodeOrName, regionValue)?.name ??
    regionValue.trim()
  );
}
