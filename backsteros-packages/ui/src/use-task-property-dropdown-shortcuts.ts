"use client";

import { useEffect } from "react";

import { isLetterDetailPath } from "./letters.js";
import { isLetterPdfToggleShortcut } from "./letter-pdf-toggle-shortcut.js";
import { openTaskPropertyDropdown } from "./open-task-property-dropdown.js";
import { shouldHandleTaskPropertyDropdownNavigation } from "./should-handle-task-property-dropdown-shortcut.js";
import { resolveTaskPropertyDropdownOpenCandidatesFromEvent } from "./task-property-dropdown-keys.js";

/**
 * S/P/A/D (and shift variants) open property dropdowns on the highlighted row
 * or compose modal — matches Next useTaskPropertyDropdownShortcuts.
 */
export function useTaskPropertyDropdownShortcuts({
  enabled = true,
  commandPaletteOpen = false,
  pathname,
}: {
  enabled?: boolean;
  commandPaletteOpen?: boolean;
  /** Active route; defaults to `window.location.pathname`. */
  pathname?: string;
} = {}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) {
        return;
      }

      const routePath = pathname ?? window.location.pathname;
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
  }, [commandPaletteOpen, enabled, pathname]);
}
