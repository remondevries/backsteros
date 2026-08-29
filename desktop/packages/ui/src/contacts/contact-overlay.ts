import { withCrmGroupSearch } from "./contact-group-filter.js";

/** Persisted width for the standalone contacts detail rail. */
export const CONTACT_DETAIL_PANEL_WIDTH_KEY = "contact-detail-panel-width";

/** @deprecated Expand-to-page layout retired; panel is resizable in-flow. */
export const CONTACT_OVERLAY_LAYOUT_PARAM = "contactLayout";

/** @deprecated Always treated as panel. */
export type ContactOverlayLayout = "page" | "panel";

/** @deprecated Always returns `"panel"`. */
export function parseContactOverlayLayout(
  _search: string,
): ContactOverlayLayout {
  return "panel";
}

/** Build contacts href with optional CRM group filter. */
export function getContactOverlayHref(
  contactSlug: string,
  options?: {
    section?: string;
    /** @deprecated Ignored — detail rail is resizable in-flow. */
    layout?: ContactOverlayLayout;
    groupId?: string | null;
  },
): string {
  const section = options?.section?.trim();
  const base = section
    ? `/contacts/${encodeURIComponent(contactSlug)}/${section}`
    : `/contacts/${encodeURIComponent(contactSlug)}`;
  const search = options?.groupId
    ? withCrmGroupSearch("", options.groupId)
    : "";
  return `${base}${search}`;
}
