import { isContentEditModeActive } from "@/lib/shortcuts/content-view-mode";
import { DEFAULT_SETTINGS_TAB, SETTINGS_NAV_TABS } from "@/lib/settings/tabs";

export const SETTINGS_SHORTCUT_KEY = ",";
export const SETTINGS_SHORTCUT_HINT = "⌘,";

export function getDefaultSettingsHref(): string {
  return (
    SETTINGS_NAV_TABS.find((tab) => tab.id === DEFAULT_SETTINGS_TAB)?.href ??
    "/settings/general"
  );
}

export function isSettingsShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  return event.key === SETTINGS_SHORTCUT_KEY || event.code === "Comma";
}

export function shouldHandleSettingsShortcut(event: KeyboardEvent): boolean {
  if (isContentEditModeActive()) {
    return false;
  }

  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }

  return isSettingsShortcutKey(event);
}
