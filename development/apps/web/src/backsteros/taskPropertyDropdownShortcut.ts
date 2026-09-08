import { isBacksterosGoLeaderPending } from "./backsterosRailMode";
import {
  isBacksterosComposeModalOpen,
  isBacksterosComposeModalTitleOrDescriptionFocused,
} from "./compose-modal-shortcut-target";
import { isBacksterosPropertyMenuOpen } from "./isBacksterosPropertyMenuOpen";
import { isBacksterosContentEditModeActive } from "./markdown-editor/contentViewMode";
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
  if (el.closest(".cm-editor") != null) return true;
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
    /** Test override for {@link isBacksterosContentEditModeActive}. */
    readonly contentEditModeActive?: boolean;
    /** Test override for compose modal open. */
    readonly composeModalOpen?: boolean;
    /** Test override for compose title/description focus. */
    readonly composeTextFieldFocused?: boolean;
  },
): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!isTaskPropertyDropdownShortcutKey(event)) return false;
  if (isBacksterosGoLeaderPending()) return false;

  const composeModalOpen = options?.composeModalOpen ?? isBacksterosComposeModalOpen();

  // Description Edit mode owns typing on the task detail surface. Compose's
  // description shell also uses data-content-view-mode="edit" by default — that
  // must not blanket-block S/P/A while the layover owns the shortcuts (desktop
  // compose has no content-view-mode gate).
  const contentEditModeActive =
    options?.contentEditModeActive ?? isBacksterosContentEditModeActive();
  if (contentEditModeActive && !composeModalOpen) return false;

  // Any open property menu owns letter keys (search filter) — do not re-fire
  // S/P/A/… or the menu toggles closed / characters never reach the input.
  const propertyMenuOpen = options?.propertyMenuOpen ?? isBacksterosPropertyMenuOpen();
  if (propertyMenuOpen) return false;

  const active =
    options?.activeElement ?? (typeof document !== "undefined" ? document.activeElement : null);

  if (isBacksterosMessageChatboxTarget(event.target) || isBacksterosMessageChatboxTarget(active)) {
    return false;
  }

  const composeTextFieldFocused =
    options?.composeTextFieldFocused ?? isBacksterosComposeModalTitleOrDescriptionFocused();
  if (composeModalOpen) {
    // Title / description own typing; otherwise compose chips receive hotkeys.
    if (composeTextFieldFocused) return false;
    if (isTaskPropertyLocalTypingTarget(event.target) || isTaskPropertyLocalTypingTarget(active)) {
      return false;
    }
    return true;
  }

  if (isTaskPropertyLocalTypingTarget(event.target) || isTaskPropertyLocalTypingTarget(active)) {
    return false;
  }

  return true;
}
