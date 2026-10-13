export const WINDOW_FULLSCREEN_SHORTCUT_HINT = "⌘⏎";

export function isWindowFullscreenShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }
  return (
    event.key === "Enter" ||
    event.code === "Enter" ||
    event.code === "NumpadEnter"
  );
}
