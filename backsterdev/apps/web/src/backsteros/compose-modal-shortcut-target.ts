/** Matches desktop `compose-modal-shortcut-target`. */

export const COMPOSE_MODAL_TEXT_FIELD_SELECTOR = "[data-compose-modal-text-field]";

export function isBacksterosComposeModalOpen(
  doc: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (doc == null) return false;
  return doc.querySelector("[data-compose-modal]") != null;
}

export function resolveBacksterosComposeModalPropertyScope(
  doc: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): HTMLElement | null {
  if (doc == null) return null;
  const modal = doc.querySelector("[data-compose-modal]");
  return modal instanceof HTMLElement ? modal : null;
}

/** True while focus is in the compose title / description text surfaces. */
export function isBacksterosComposeModalTitleOrDescriptionFocused(
  doc: Document | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (doc == null) return false;
  const active = doc.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active.matches(COMPOSE_MODAL_TEXT_FIELD_SELECTOR)) return true;
  // CodeMirror description edit — not marked with the text-field attr.
  if (active.closest("[data-compose-modal] .cm-editor") != null) return true;
  return false;
}
