import { useEffect } from "react";

import { isBacksterosGoLeaderPending } from "./backsterosRailMode";
import { shouldYieldPlainKeyHotkey } from "./plainKeyShortcutGuard";
import { isCommandPaletteOpen } from "~/commandPaletteBus";
import { isModelPickerOpen } from "~/modelPickerVisibility";
import { isTerminalFocused } from "~/lib/terminalFocus";

function isComposeShortcutKey(event: Pick<KeyboardEvent, "key" | "code">): boolean {
  return (event.key.length === 1 && event.key.toLowerCase() === "c") || event.code === "KeyC";
}

/**
 * Desktop-parity plain `C` opens create-task compose (BacksterDEV).
 * Yields to editable fields, Shift+C (comments / contact), chords, and palettes.
 */
export function useBacksterosComposeShortcut(options: {
  readonly enabled: boolean;
  readonly onCompose: () => void;
}) {
  const { enabled, onCompose } = options;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!isComposeShortcutKey(event)) return;
      if (isCommandPaletteOpen() || isModelPickerOpen() || isTerminalFocused()) return;
      if (isBacksterosGoLeaderPending()) return;
      if (shouldYieldPlainKeyHotkey(event)) return;
      // Compose modal already open — do not re-fire.
      if (document.querySelector("[data-compose-modal]")) return;

      event.preventDefault();
      event.stopPropagation();
      onCompose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onCompose]);
}
