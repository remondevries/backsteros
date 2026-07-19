"use client";

import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { isLetterDetailPath } from "@/lib/letters/navigation-path";
import { isLetterPdfToggleShortcut } from "@/lib/shortcuts/letter-pdf-toggle-shortcut";
import { openTaskPropertyDropdown } from "@/lib/shortcuts/open-task-property-dropdown";
import { shouldHandleTaskPropertyDropdownNavigation } from "@/lib/shortcuts/should-handle-task-property-dropdown-shortcut";
import { resolveTaskPropertyDropdownOpenCandidatesFromEvent } from "@/lib/shortcuts/task-property-dropdown-keys";

export function useTaskPropertyDropdownShortcuts({
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

      const routePath = window.location.pathname;
      // Letter detail: plain P toggles PDF — do not open priority/project.
      if (
        isLetterPdfToggleShortcut(event) &&
        isLetterDetailPath(routePath)
      ) {
        return;
      }

      if (!shouldHandleTaskPropertyDropdownNavigation(event)) {
        return;
      }

      const dropdownIds =
        resolveTaskPropertyDropdownOpenCandidatesFromEvent(event);
      if (dropdownIds.length === 0) {
        return;
      }

      if (!openTaskPropertyDropdown(dropdownIds)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled]);
}
