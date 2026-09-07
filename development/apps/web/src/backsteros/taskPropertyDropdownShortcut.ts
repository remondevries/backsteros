import { isBacksterosGoLeaderPending } from "./backsterosRailMode";
import { isBacksterosPropertyMenuOpen } from "./isBacksterosPropertyMenuOpen";
import { isTaskPropertyDropdownShortcutKey } from "./taskPropertyDropdownKeys";

function asClosestElement(
  target: EventTarget | null,
): { closest: (selector: string) => Element | null } | null {
  if (target == null || typeof target !== "object") return null;
  if (!("closest" in target) || typeof target.closest !== "function") {
    return null;
  }
  return target as { closest: (selector: string) => Element | null };
}

/**
 * True when focus is in the thread message chatbox (Lexical composer).
 * Property letter hotkeys must yield here so typing is not stolen.
 *
 * Matches ChatComposer’s notion of focus: the prompt editor **or** anything
 * inside the composer form (not only `[data-testid="composer-editor"]`).
 */
export function isBacksterosMessageChatboxTarget(target: EventTarget | null): boolean {
  const el = asClosestElement(target);
  if (!el) return false;
  if (el.closest('[data-testid="composer-editor"]') != null) return true;
  if (el.closest('[data-chat-composer-transition-prompt="true"]') != null) {
    return true;
  }
  // Resting/expanded composer chrome + editor share this form root.
  if (el.closest('[data-chat-composer-form="true"]') != null) return true;
  return false;
}

/**
 * Open property menus need letter keys for search filtering; title rename
 * needs them for typing. Not the message chatbox, but still typing surfaces.
 */
export function isTaskPropertyLocalTypingTarget(target: EventTarget | null): boolean {
  const el = asClosestElement(target);
  if (!el) return false;
  if (el.closest(".bos-task-property-menu__search-input") != null) return true;
  if (el.closest(".bos-task-property-menu") != null) return true;
  if (el.closest('[data-slot="menu-popup"]') != null) return true;
  if (el.closest(".bos-overview-name-editor") != null) return true;
  if (el.closest('[data-slot="command-dialog-popup"]') != null) return true;
  return false;
}

export function shouldHandleTaskPropertyDropdownShortcut(
  event: Pick<
    KeyboardEvent,
    "repeat" | "metaKey" | "ctrlKey" | "altKey" | "key" | "code" | "shiftKey" | "target"
  >,
  options?: {
    readonly activeElement?: EventTarget | null;
    /** Test override for {@link isBacksterosPropertyMenuOpen}. */
    readonly propertyMenuOpen?: boolean;
  },
): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!isTaskPropertyDropdownShortcutKey(event)) return false;
  if (isBacksterosGoLeaderPending()) return false;

  // Any open property menu owns letter keys (search filter) — do not re-fire
  // S/P/A/… or the menu toggles closed / characters never reach the input.
  const propertyMenuOpen = options?.propertyMenuOpen ?? isBacksterosPropertyMenuOpen();
  if (propertyMenuOpen) return false;

  const active =
    options?.activeElement ?? (typeof document !== "undefined" ? document.activeElement : null);

  if (isBacksterosMessageChatboxTarget(event.target) || isBacksterosMessageChatboxTarget(active)) {
    return false;
  }
  if (isTaskPropertyLocalTypingTarget(event.target) || isTaskPropertyLocalTypingTarget(active)) {
    return false;
  }

  return true;
}
