"use client";

import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { requestOpenComposeModal } from "@/lib/compose-modal-events";
import { shouldHandleComposeShortcut } from "@/lib/shortcuts/should-handle-compose-shortcut";

export function useComposeShortcut({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { open: commandPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) {
        return;
      }

      if (!shouldHandleComposeShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestOpenComposeModal();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled]);
}
