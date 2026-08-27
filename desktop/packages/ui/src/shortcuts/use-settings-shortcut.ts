"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { getDefaultSettingsHref } from "../navigation/settings.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "./shortcut-guards.js";
import { afterNextPaint } from "../timing/after-next-paint.js";

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
  closePalette,
  onNavigate,
}: {
  enabled?: boolean;
  closePalette: () => void;
  onNavigate: (href: string) => void;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

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
      const commandPaletteOpen = openRef.current ?? false;
      if (isBlockingModalOpen() && !commandPaletteOpen) {
        return;
      }

      event.preventDefault();
      onNavigate(getDefaultSettingsHref());
      afterNextPaint(() => closePalette());
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closePalette, enabled, onNavigate, openRef]);
}
