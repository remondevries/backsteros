import { isEmailPath } from "./email.js";
import type { EmailThreadBodyViewMode } from "./email.js";
import { EMAIL_BODY_VIEW_MODE_ORDER } from "./email-body-view-mode.js";
import { isBlockingModalOpen } from "../shortcuts/shortcut-guards.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";

/** Email detail body toggle: 1 = plain, 2 = rendered, 3 = source. */
export function resolveEmailBodyViewModeFromDigitKey(
  key: string,
): EmailThreadBodyViewMode | null {
  const index = Number(key) - 1;
  if (index < 0 || index >= EMAIL_BODY_VIEW_MODE_ORDER.length) {
    return null;
  }
  return EMAIL_BODY_VIEW_MODE_ORDER[index] ?? null;
}

export function shouldHandleEmailBodyViewModeShortcut(
  event: KeyboardEvent,
  pathname: string,
): boolean {
  if (!isEmailPath(pathname)) {
    return false;
  }

  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }

  if (!resolveEmailBodyViewModeFromDigitKey(event.key)) {
    return false;
  }

  if (!shouldHandleGlobalShortcut(event)) {
    return false;
  }

  if (isBlockingModalOpen()) {
    return false;
  }

  if (document.querySelector("[data-compose-modal]")) {
    return false;
  }

  const target = event.target;
  if (target instanceof HTMLElement) {
    if (target.closest("[data-searchable-dropdown-panel]")) {
      return false;
    }
    if (target.closest(".command-dialog") || target.closest(".command-palette")) {
      return false;
    }
  }

  return true;
}

export function resolveEmailBodyViewModeFromShortcut(
  _current: EmailThreadBodyViewMode,
  event: Pick<KeyboardEvent, "key">,
): EmailThreadBodyViewMode | null {
  return resolveEmailBodyViewModeFromDigitKey(event.key);
}
