import { useEffect } from "react";

import {
  isBlockingModalOpen,
  isContentEditModeActive,
} from "@backsteros/ui";

import { toggleDesktopOverlayPalette } from "./desktop-overlay";
import { isTauriRuntime } from "./whoop";

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
 * In-window ⌘⌥K fallback when the webview consumes the global shortcut,
 * plus browser-dev open of in-app palette when not in Tauri.
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

      if (isTauriRuntime()) {
        void toggleDesktopOverlayPalette();
        return;
      }

      onOpenPalette();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onOpenPalette]);
}
