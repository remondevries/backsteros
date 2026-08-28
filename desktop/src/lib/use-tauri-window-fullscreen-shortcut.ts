import { useEffect } from "react";

import { shouldHandleTabChromeShortcut } from "@backsteros/ui";

import { toggleTauriWindowFullscreen } from "./use-tauri-window-fullscreen";
import { isWindowFullscreenShortcut } from "./window-fullscreen-shortcut";

export {
  isWindowFullscreenShortcut,
  WINDOW_FULLSCREEN_SHORTCUT_HINT,
} from "./window-fullscreen-shortcut";

/**
 * ⌘Enter / Ctrl+Enter — toggle native Tauri window fullscreen.
 * Treated as window chrome so it still works while focus is in editors.
 */
export function useTauriWindowFullscreenShortcut({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isWindowFullscreenShortcut(event)) {
        return;
      }
      if (!shouldHandleTabChromeShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void toggleTauriWindowFullscreen().catch(() => {
        /* non-Tauri / permission denied — ignore */
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
