import { useEffect } from "react";

import {
  isBlockingModalOpen,
  isContentEditModeActive,
  useCommandPaletteRuntimeRefs,
} from "@backsteros/ui";

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
 * ⌘⌥C opens the in-app compose modal (main-window session).
 * Packaged Tauri used a separate overlay webview that did not share Clerk
 * cookies, so compose rendered blank / unsigned-in.
 */
export function useComposeGlobalShortcut({
  enabled = true,
  onCompose,
}: {
  enabled?: boolean;
  onCompose: () => void;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) {
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
      onCompose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onCompose, openRef]);
}
