"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isLetterDetailPath } from "../letters/letters.js";
import { isLetterPdfToggleShortcut } from "../letters/letter-pdf-toggle-shortcut.js";
import { isPersonalAssistantDoubleAKey } from "../chat/personal-assistant-double-a.js";
import { shouldHandleTaskPropertyDropdownNavigation } from "./should-handle-task-property-dropdown-shortcut.js";
import { tryOpenPropertyDropdownForShortcutEvent } from "./try-open-property-dropdown-for-shortcut-event.js";

/**
 * S/P/A/T/W/D/R/L (and shift variants) open property dropdowns on the highlighted row
 * or compose modal — matches Next useTaskPropertyDropdownShortcuts.
 * Plain S opens status. Plain H opens health on codebase projects.
 * Plain T opens project type. Plain W opens the codebase workspace folder.
 * Plain R opens the codebase repository, otherwise related contacts or letter received date.
 * Shift+A opens project area (finance account still wins when finance chrome is open).
 * On finance lists: plain C/A/O/M/R open tx fields (detail preferred when open);
 * P/G open project/goal only while the transaction detail panel is open;
 * Shift+A/C/O/G/R/M open filter or bulk chrome.
 * Plain L opens Labels when that property is on screen.
 *
 * Plain A is owned by the personal-assistant double-tap chord (A A → chat;
 * single A deferred → assignee). Shift+A still opens here immediately.
 */
export function useTaskPropertyDropdownShortcuts({
  enabled = true,
  pathname,
}: {
  enabled?: boolean;
  /** Active route; defaults to `window.location.pathname`. */
  pathname?: string;
} = {}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) {
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

      // Plain A → deferred assignee / A A chat (shell capture listener).
      if (isPersonalAssistantDoubleAKey(event)) {
        return;
      }

      if (!shouldHandleTaskPropertyDropdownNavigation(event)) {
        return;
      }

      if (!tryOpenPropertyDropdownForShortcutEvent(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, openRef, pathname]);
}
