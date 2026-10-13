export const COMPOSE_MODAL_TEXT_FIELD_SELECTOR =
  "[data-compose-modal-text-field]";

export function isComposeModalTitleOrDescriptionFocused(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    active.matches(COMPOSE_MODAL_TEXT_FIELD_SELECTOR)
  );
}

export function resolveComposeModalPropertyScope(): HTMLElement | null {
  const modal = document.querySelector("[data-compose-modal]");
  return modal instanceof HTMLElement ? modal : null;
}
