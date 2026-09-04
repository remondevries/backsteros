/** Mirrors `@backsteros/ui` organization-sections. */

export const ORGANIZATION_SECTION_IDS = [
  "overview",
  "activity",
  "projects",
  "letters",
  "contacts",
  "transactions",
  "invoices",
] as const;

export type OrganizationSectionId = (typeof ORGANIZATION_SECTION_IDS)[number];

export type OrganizationSectionConfig = {
  id: OrganizationSectionId;
  label: string;
};

export const ORGANIZATION_SECTIONS: readonly OrganizationSectionConfig[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "projects", label: "Projects" },
  { id: "letters", label: "Letters" },
  { id: "contacts", label: "Contacts" },
  { id: "transactions", label: "Transactions" },
  { id: "invoices", label: "Invoices" },
];

export const DEFAULT_ORGANIZATION_SECTION: OrganizationSectionId = "overview";

export type VisibleOrganizationSectionsOptions = {
  hasTransactions?: boolean;
  hasInvoices?: boolean;
};

export function resolveVisibleOrganizationSections(
  options: VisibleOrganizationSectionsOptions = {},
): OrganizationSectionConfig[] {
  return ORGANIZATION_SECTIONS.filter((section) => {
    if (section.id === "transactions") return Boolean(options.hasTransactions);
    if (section.id === "invoices") return Boolean(options.hasInvoices);
    return true;
  });
}

export function getOrganizationSectionLabel(
  section: OrganizationSectionId,
): string {
  return (
    ORGANIZATION_SECTIONS.find((entry) => entry.id === section)?.label ??
    section
  );
}
