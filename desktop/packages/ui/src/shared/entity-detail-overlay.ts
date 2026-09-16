/**
 * Shared profile-card rail metrics — contacts, organizations, catalog domains.
 * Keep aliases in entity-specific overlay modules for stable imports.
 */

/** Width for the standalone detail card — fraction of the content area. */
export const ENTITY_DETAIL_PANEL_WIDTH = "30%";

/** Collapsed reopen strip — matches agent / journal calendar strip. */
export const ENTITY_DETAIL_STRIP_WIDTH_PX = 46;

/** Match agent-rail / context-panel collapse duration. */
export const ENTITY_DETAIL_COLLAPSE_DURATION_MS = 220;

/** Crossfade when switching entities while the panel stays open. */
export const ENTITY_DETAIL_CONTENT_FADE_MS = 280;

/** Fade list ↔ expanded workspace when toggling overlay layout to page. */
export const ENTITY_DETAIL_EXPAND_FADE_MS = ENTITY_DETAIL_CONTENT_FADE_MS;

export type EntityOverlayLayout = "page" | "panel";

export type EntityDetailWorkspaceTab = {
  id: string;
  label: string;
};
