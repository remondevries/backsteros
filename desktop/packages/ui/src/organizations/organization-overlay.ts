import { withCrmGroupSearch } from "../contacts/contact-group-filter.js";

/**
 * Width for the standalone organizations detail card — fraction of the content area.
 * Matches contacts so both rails align visually.
 */
export const ORGANIZATION_DETAIL_PANEL_WIDTH = "30%";

/** Collapsed reopen strip — matches contacts / agent rail. */
export const ORGANIZATION_DETAIL_STRIP_WIDTH_PX = 46;

/** Match contact / agent-rail collapse duration. */
export const ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS = 220;

/** Crossfade when switching organizations while the panel stays open. */
export const ORGANIZATION_DETAIL_CONTENT_FADE_MS = 280;

/** Fade list ↔ expanded workspace when toggling orgLayout=page. */
export const ORGANIZATION_DETAIL_EXPAND_FADE_MS =
  ORGANIZATION_DETAIL_CONTENT_FADE_MS;

/** Search param: organization overlay opens as full page vs narrow right panel. */
export const ORGANIZATION_OVERLAY_LAYOUT_PARAM = "orgLayout";

export type OrganizationOverlayLayout = "page" | "panel";

/**
 * Left workspace tabs when the org overlay is expanded.
 * Card keeps Activity / Details; these are the former full-page org sections.
 */
export const ORGANIZATION_EXPANDED_WORKSPACE_TAB_IDS = [
  "projects",
  "contacts",
  "letters",
  "transactions",
  "invoices",
] as const;

export type OrganizationExpandedWorkspaceTabId =
  (typeof ORGANIZATION_EXPANDED_WORKSPACE_TAB_IDS)[number];

export const ORGANIZATION_EXPANDED_WORKSPACE_TABS: readonly {
  id: OrganizationExpandedWorkspaceTabId;
  label: string;
}[] = [
  { id: "projects", label: "Projects" },
  { id: "contacts", label: "Contacts" },
  { id: "letters", label: "Letters" },
  { id: "transactions", label: "Transactions" },
  { id: "invoices", label: "Invoices" },
];

export function parseOrganizationOverlayLayout(
  search: string,
): OrganizationOverlayLayout {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return params.get(ORGANIZATION_OVERLAY_LAYOUT_PARAM) === "page"
    ? "page"
    : "panel";
}

/** Build organizations href with optional overlay layout and CRM group filter. */
export function getOrganizationOverlayHref(
  organizationSlug: string,
  options?: {
    section?: string;
    layout?: OrganizationOverlayLayout;
    groupId?: string | null;
  },
): string {
  const section = options?.section?.trim();
  const base = section
    ? `/organizations/${encodeURIComponent(organizationSlug)}/${section}`
    : `/organizations/${encodeURIComponent(organizationSlug)}`;
  let search = "";
  if (options?.layout === "page") {
    search = `?${ORGANIZATION_OVERLAY_LAYOUT_PARAM}=page`;
  }
  if (options?.groupId) {
    search = withCrmGroupSearch(search, options.groupId);
  }
  return `${base}${search}`;
}
