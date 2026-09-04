import { withCrmGroupSearch } from "./contact-group-filter.js";

/**
 * Width for the standalone contacts detail card — fraction of the content area.
 */
export const CONTACT_DETAIL_PANEL_WIDTH = "30%";

/** Collapsed reopen strip — matches agent / journal calendar strip. */
export const CONTACT_DETAIL_STRIP_WIDTH_PX = 46;

/** Match agent-rail / context-panel collapse duration. */
export const CONTACT_DETAIL_COLLAPSE_DURATION_MS = 220;

/** Crossfade when switching contacts while the panel stays open. */
export const CONTACT_DETAIL_CONTENT_FADE_MS = 280;

/** Fade list ↔ expanded workspace when toggling contactLayout=page. */
export const CONTACT_DETAIL_EXPAND_FADE_MS = CONTACT_DETAIL_CONTENT_FADE_MS;

/** @deprecated Width is percentage-based; kept so existing imports keep compiling. */
export const CONTACT_DETAIL_PANEL_WIDTH_KEY = "contact-detail-panel-width";

/** Search param: contact overlay opens as full page vs narrow right panel. */
export const CONTACT_OVERLAY_LAYOUT_PARAM = "contactLayout";

export type ContactOverlayLayout = "page" | "panel";

/** Left workspace tabs when the contact overlay is expanded to page layout. */
export const CONTACT_EXPANDED_WORKSPACE_TAB_IDS = [
  "meetings",
  "emails",
  "tasks",
  "letters",
  "social",
] as const;

export type ContactExpandedWorkspaceTabId =
  (typeof CONTACT_EXPANDED_WORKSPACE_TAB_IDS)[number];

export const CONTACT_EXPANDED_WORKSPACE_TABS: readonly {
  id: ContactExpandedWorkspaceTabId;
  label: string;
}[] = [
  { id: "meetings", label: "Meetings" },
  { id: "emails", label: "Emails" },
  { id: "tasks", label: "Tasks" },
  { id: "letters", label: "Letters" },
  { id: "social", label: "Social" },
];

export function parseContactOverlayLayout(
  search: string,
): ContactOverlayLayout {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return params.get(CONTACT_OVERLAY_LAYOUT_PARAM) === "page" ? "page" : "panel";
}

/** Build contacts href with optional overlay layout and CRM group filter. */
export function getContactOverlayHref(
  contactSlug: string,
  options?: {
    section?: string;
    layout?: ContactOverlayLayout;
    groupId?: string | null;
  },
): string {
  const section = options?.section?.trim();
  const base = section
    ? `/contacts/${encodeURIComponent(contactSlug)}/${section}`
    : `/contacts/${encodeURIComponent(contactSlug)}`;
  let search = "";
  if (options?.layout === "page") {
    search = `?${CONTACT_OVERLAY_LAYOUT_PARAM}=page`;
  }
  if (options?.groupId) {
    search = withCrmGroupSearch(search, options.groupId);
  }
  return `${base}${search}`;
}
