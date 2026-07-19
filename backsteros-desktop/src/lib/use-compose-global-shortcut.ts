import { useEffect } from "react";

import {
  isBlockingModalOpen,
  isContentEditModeActive,
} from "@backsteros/ui";

import { toggleDesktopOverlayCompose } from "../lib/desktop-overlay";
import { isTauriRuntime } from "../lib/whoop";

export const COMPOSE_GLOBAL_SHORTCUT = "CmdOrCtrl+Alt+C";

export function isComposeGlobalShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) {
    return false;
  }

  // On macOS, Option+C remaps event.key to "ç", so fall back to the physical key.
  return event.code === "KeyC" || event.key.toLowerCase() === "c";
}

/**
 * In-window ⌘⌥C fallback when the webview consumes the global shortcut,
 * plus browser-dev open of in-app compose when not in Tauri.
 */
export function useComposeGlobalShortcut({
  enabled = true,
  commandPaletteOpen = false,
  onCompose,
}: {
  enabled?: boolean;
  commandPaletteOpen?: boolean;
  onCompose: () => void;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) {
        return;
      }

      if (!isComposeGlobalShortcut(event)) {
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
        void toggleDesktopOverlayCompose();
        return;
      }

      onCompose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, onCompose]);
}
