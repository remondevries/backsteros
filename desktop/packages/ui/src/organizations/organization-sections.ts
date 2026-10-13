import {
  DEFAULT_LIST_BOARD_VIEW,
  LIST_BOARD_VIEW_SEARCH_PARAM,
  type ListBoardView,
} from "../list-nav/list-board-view.js";

export const ORGANIZATION_SECTION_IDS = [
  "overview",
  "details",
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

/**
 * Tabs on the standalone org profile card (Activity / Details).
 * A "More..." tab is appended in the UI to expand the workspace.
 */
export const ORGANIZATION_CARD_SECTIONS: readonly OrganizationSectionConfig[] = [
  { id: "overview", label: "Activity" },
  { id: "details", label: "Details" },
];

export const ORGANIZATION_SECTIONS: readonly OrganizationSectionConfig[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "projects", label: "Projects" },
  { id: "letters", label: "Letters" },
  { id: "contacts", label: "Contacts" },
  { id: "transactions", label: "Transactions" },
  { id: "invoices", label: "Invoices" },
];

/** Always-visible org tabs (finance tabs are opt-in when linked data exists). */
export const ORGANIZATION_BASE_SECTION_IDS = [
  "overview",
  "activity",
  "projects",
  "letters",
  "contacts",
] as const satisfies readonly OrganizationSectionId[];

export type VisibleOrganizationSectionsOptions = {
  hasTransactions?: boolean;
  hasInvoices?: boolean;
};

/**
 * Organization pill tabs. Transactions / Invoices only appear when the org has
 * linked financial rows (or Moneybird invoices via `moneybirdContactId`).
 */
export function resolveVisibleOrganizationSections(
  options: VisibleOrganizationSectionsOptions = {},
): OrganizationSectionConfig[] {
  return ORGANIZATION_SECTIONS.filter((section) => {
    if (section.id === "transactions") return Boolean(options.hasTransactions);
    if (section.id === "invoices") return Boolean(options.hasInvoices);
    return true;
  });
}

/** Workspace tabs for expanded org overlay (excludes card Activity/Details). */
export function resolveOrganizationWorkspaceTabs(
  options: VisibleOrganizationSectionsOptions = {},
): OrganizationSectionConfig[] {
  return resolveVisibleOrganizationSections(options).filter(
    (section) =>
      section.id !== "overview" &&
      section.id !== "activity" &&
      section.id !== "details",
  );
}

export function isOrganizationSectionId(
  value: string,
): value is OrganizationSectionId {
  return (ORGANIZATION_SECTION_IDS as readonly string[]).includes(value);
}

export function isOrganizationCardSectionId(
  value: string,
): value is "overview" | "details" {
  return value === "overview" || value === "details";
}

export function parseOrganizationSectionId(
  value: string | null | undefined,
): OrganizationSectionId {
  if (!value || value === "overview") return "overview";
  // Legacy: full-page Activity tab → card Activity (overview id).
  if (value === "activity") return "overview";
  return isOrganizationSectionId(value) ? value : "overview";
}

export function getActiveOrganizationSection(
  pathname: string,
  organizationSlug: string,
): OrganizationSectionId {
  const base = `/organizations/${encodeURIComponent(organizationSlug)}`;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const rawMatch = pathname.match(/^\/organizations\/([^/]+)/);
  const resolvedBase =
    rawMatch &&
    decodeURIComponent(rawMatch[1]!).toLowerCase() ===
      organizationSlug.toLowerCase()
      ? `/organizations/${rawMatch[1]}`
      : normalized.startsWith(base)
        ? base
        : null;

  if (!resolvedBase) return "overview";

  // Include card-only `details` plus workspace sections (projects, …).
  for (const sectionId of ORGANIZATION_SECTION_IDS) {
    const segment = getOrganizationSectionSegment(sectionId);
    if (!segment) continue;
    const sectionPath = `${resolvedBase}/${segment}`;
    if (
      normalized === sectionPath ||
      normalized.startsWith(`${sectionPath}/`)
    ) {
      // Legacy /activity URL → card Activity tab (overview id).
      if (sectionId === "activity") return "overview";
      return sectionId;
    }
  }

  return "overview";
}

export function getOrganizationSectionSegment(
  section: OrganizationSectionId,
): string {
  return section === "overview" ? "" : section;
}

export function getOrganizationSectionHref(
  organizationSlug: string,
  section: OrganizationSectionId = "overview",
): string {
  const base = `/organizations/${encodeURIComponent(organizationSlug)}`;
  const segment = getOrganizationSectionSegment(section);
  return segment ? `${base}/${segment}` : base;
}

export function isOrganizationProjectsListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return /^\/organizations\/[^/]+\/projects$/.test(path);
}

export function getOrganizationIdFromProjectsPathname(
  pathname: string,
): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.match(/^\/organizations\/([^/]+)\/projects(?:\/|$)/)?.[1] ?? null;
}

export function buildOrganizationProjectsHref(
  organizationSlug: string,
  options?: {
    view?: ListBoardView;
  },
): string {
  const base = getOrganizationSectionHref(organizationSlug, "projects");
  const view = options?.view ?? DEFAULT_LIST_BOARD_VIEW;

  if (view === "board") {
    return `${base}?${LIST_BOARD_VIEW_SEARCH_PARAM}=board`;
  }

  return base;
}
