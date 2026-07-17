import { getHorizontalArrowDirection } from "@/lib/shortcuts/cmd-option-arrow-shortcut";

export const OPEN_COMPOSE_MODAL_EVENT = "backsteros:open-compose-modal";

export const COMPOSE_SHORTCUT_KEY = "c";
export const COMPOSE_SHORTCUT_HINT = "C";

export type ComposeKind = "task" | "document";

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
