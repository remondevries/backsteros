/**
 * ⌘K / Ctrl+K and ⌘⇧K / Ctrl+⇧K toggle the command palette.
 * Option/Alt is reserved for the system-wide ⌘⌥K global shortcut.
 * WKWebView often swallows plain ⌘K; ⌘⇧K remains visible to JS as a fallback.
 */
export function isCommandPaletteToggleKey(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey"
  >,
): boolean {
  if (event.altKey) {
    return false;
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return false;
  }
  return event.key.toLowerCase() === "k" || event.code === "KeyK";
}
