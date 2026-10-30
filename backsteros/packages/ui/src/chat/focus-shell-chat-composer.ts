/** Composer input inside the global right chat column. */
export const SHELL_CHAT_COMPOSER_INPUT_SELECTOR =
  ".desktop-chat-panel:not(.is-collapsed) .chat-ui-composer__input";

export function focusShellChatComposer(): boolean {
  if (typeof document === "undefined") return false;
  const input = document.querySelector(SHELL_CHAT_COMPOSER_INPUT_SELECTOR);
  if (!(input instanceof HTMLElement)) return false;
  input.focus({ preventScroll: true });
  return document.activeElement === input;
}

/**
 * Focus after the chat column expands. Collapse flip is double-rAF deferred,
 * then React removes `inert` — retry a few times until the input accepts focus.
 */
export function scheduleFocusShellChatComposer(): void {
  if (typeof window === "undefined") return;
  const delaysMs = [0, 32, 80, 160, 280];
  for (const delay of delaysMs) {
    window.setTimeout(() => {
      focusShellChatComposer();
    }, delay);
  }
}

export function isFocusInsideShellChatPanel(
  target: EventTarget | null = typeof document !== "undefined"
    ? document.activeElement
    : null,
): boolean {
  if (!(target instanceof Node) || typeof document === "undefined") {
    return false;
  }
  const panel = document.querySelector(".desktop-chat-panel:not(.is-collapsed)");
  return Boolean(panel?.contains(target));
}

export function isShellChatSlashMenuOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector(
      ".desktop-chat-panel:not(.is-collapsed) .chat-ui-composer__slash-menu",
    ),
  );
}
