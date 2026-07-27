"use client";

import { useEffect } from "react";

import { getDefaultSettingsHref } from "./settings.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "./shortcut-guards.js";

const SETTINGS_SHORTCUT_KEY = ",";

function isSettingsShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  return event.key === SETTINGS_SHORTCUT_KEY || event.code === "Comma";
}

/**
 * ⌘, / Ctrl+, → settings (Next useSettingsShortcut).
 */
export function useSettingsShortcut({
  enabled = true,
  commandPaletteOpen = false,
  closePalette,
  onNavigate,
}: {
  enabled?: boolean;
  commandPaletteOpen?: boolean;
  closePalette: () => void;
  onNavigate: (href: string) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (!isSettingsShortcutKey(event)) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }
      if (isBlockingModalOpen() && !commandPaletteOpen) {
        return;
      }

      event.preventDefault();
      closePalette();
      onNavigate(getDefaultSettingsHref());
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closePalette, commandPaletteOpen, enabled, onNavigate]);
}
