import { useEffect } from "react";

import {
  isBlockingModalOpen,
  isContentEditModeActive,
} from "@backsteros/ui";

export const COMMAND_PALETTE_GLOBAL_SHORTCUT = "CmdOrCtrl+Alt+K";

export function isCommandPaletteGlobalShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) {
    return false;
  }

  return event.code === "KeyK" || event.key.toLowerCase() === "k";
}

/**
 * ⌘⌥K opens the in-app command palette (main-window session).
 * Packaged Tauri used a separate overlay webview that did not share app state
 * cookies unless data stores matched — prefer the main-window palette.
 */
export function useCommandPaletteGlobalShortcut({
  enabled = true,
  onOpenPalette,
}: {
  enabled?: boolean;
  onOpenPalette: () => void;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isCommandPaletteGlobalShortcut(event)) {
        return;
      }

      if (isContentEditModeActive()) {
        return;
      }

      if (isBlockingModalOpen()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onOpenPalette();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onOpenPalette]);
}
