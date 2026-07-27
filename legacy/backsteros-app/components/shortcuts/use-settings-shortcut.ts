"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import {
  getDefaultSettingsHref,
  shouldHandleSettingsShortcut,
} from "@/lib/settings/settings-shortcut";

export function useSettingsShortcut({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const router = useRouter();
  const { open: commandPaletteOpen, setOpen } = useCommandPalette();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!shouldHandleSettingsShortcut(event)) {
        return;
      }

      if (isBlockingModalOpen() && !commandPaletteOpen) {
        return;
      }

      event.preventDefault();
      setOpen(false);
      router.push(getDefaultSettingsHref());
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, enabled, router, setOpen]);
}
