export const OPEN_COMPOSE_MODAL_EVENT = "backsteros:open-compose-modal";

export const COMPOSE_SHORTCUT_KEY = "c";
export const COMPOSE_SHORTCUT_HINT = "C";

export type ComposeKind = "task" | "document";

export type HorizontalArrowDirection = "left" | "right";

/** Local port of Next's cmd-option-arrow-shortcut helpers (compose modal only needs these). */
export function getHorizontalArrowDirection(
  key: string,
  code: string,
): HorizontalArrowDirection | null {
  if (key === "ArrowLeft" || code === "ArrowLeft") {
    return "left";
  }

  if (key === "ArrowRight" || code === "ArrowRight") {
    return "right";
  }

  return null;
}

export function isHorizontalArrowKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  return getHorizontalArrowDirection(event.key, event.code) !== null;
}

/** Compose modal task/document toggle (cmd+shift+arrows). */
export function hasCmdShiftArrowShortcutModifiers(event: KeyboardEvent): boolean {
  const primary = event.metaKey || event.ctrlKey;
  return primary && event.shiftKey && !event.altKey;
}

export function getComposeKindForShortcutKey(
  key: string,
  code: string,
): ComposeKind | null {
  const direction = getHorizontalArrowDirection(key, code);

  if (direction === "left") {
    return "task";
  }

  if (direction === "right") {
    return "document";
  }

  return null;
}

export function requestOpenComposeModal(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(OPEN_COMPOSE_MODAL_EVENT));
}
