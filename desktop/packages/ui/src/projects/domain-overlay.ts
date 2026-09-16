import {
  ENTITY_DETAIL_COLLAPSE_DURATION_MS,
  ENTITY_DETAIL_CONTENT_FADE_MS,
  ENTITY_DETAIL_EXPAND_FADE_MS,
  type EntityOverlayLayout,
} from "../shared/entity-detail-overlay.js";

export const DOMAIN_DETAIL_COLLAPSE_DURATION_MS =
  ENTITY_DETAIL_COLLAPSE_DURATION_MS;
export const DOMAIN_DETAIL_CONTENT_FADE_MS = ENTITY_DETAIL_CONTENT_FADE_MS;
export const DOMAIN_DETAIL_EXPAND_FADE_MS = ENTITY_DETAIL_EXPAND_FADE_MS;

export type DomainOverlayLayout = EntityOverlayLayout;

export const DOMAIN_EXPANDED_WORKSPACE_TAB_IDS = ["tasks"] as const;

export type DomainExpandedWorkspaceTabId =
  (typeof DOMAIN_EXPANDED_WORKSPACE_TAB_IDS)[number];

export const DOMAIN_EXPANDED_WORKSPACE_TABS: readonly {
  id: DomainExpandedWorkspaceTabId;
  label: string;
}[] = [{ id: "tasks", label: "Tasks" }];

/**
 * True while the Catalog Domains profile rail is open (panel or page) — not
 * the collapsed `]` strip. When engaged, 1–9 belong to domain card / workspace
 * tabs instead of Catalog type filters.
 */
export function isDomainDetailOverlayEngaged(): boolean {
  if (typeof document === "undefined") return false;
  // Prefer the rail aside — chrome can still report "panel" while collapsed.
  const rail = document.querySelector(
    ".contact-detail-panel--rail[data-domain-overlay]",
  );
  if (!rail) return false;
  const layout = rail.getAttribute("data-domain-overlay-layout");
  return layout === "panel" || layout === "page";
}
