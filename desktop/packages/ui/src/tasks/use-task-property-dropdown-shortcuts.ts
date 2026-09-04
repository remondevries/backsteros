"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isLetterDetailPath } from "../letters/letters.js";
import { isLetterPdfToggleShortcut } from "../letters/letter-pdf-toggle-shortcut.js";
import {
  openFinanceChromeDropdown,
  openFinanceTxPropertyDropdown,
  openTaskPropertyDropdown,
} from "./open-task-property-dropdown.js";
import { shouldHandleTaskPropertyDropdownNavigation } from "./should-handle-task-property-dropdown-shortcut.js";
import {
  pageHasFinanceChromeHotkeyTargets,
  resolveFinanceChromeDropdownOpenCandidatesFromEvent,
  resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent,
  resolveTaskPropertyDropdownOpenCandidatesFromEvent,
  shouldYieldComposeToFinanceTxCategory,
} from "./task-property-dropdown-keys.js";

/**
 * S/P/A/D/R (and shift variants) open property dropdowns on the highlighted row
 * or compose modal — matches Next useTaskPropertyDropdownShortcuts.
 * On finance lists: plain C/A/O/M/R open tx fields (detail preferred when open);
 * P/G open project/goal only while the transaction detail panel is open;
 * Shift+A/C/O/G/R/M open filter or bulk chrome.
 * Plain R opens Related on tasks (or Received date on letters).
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

      if (!shouldHandleTaskPropertyDropdownNavigation(event)) {
        return;
      }

      if (pageHasFinanceChromeHotkeyTargets()) {
        const chromeIds =
          resolveFinanceChromeDropdownOpenCandidatesFromEvent(event);
        if (chromeIds.length > 0 && openFinanceChromeDropdown(chromeIds)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }
      }

      const financeIds =
        resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent(event);
      const financeCandidates =
        shouldYieldComposeToFinanceTxCategory() ||
        !financeIds.includes("category")
          ? financeIds
          : financeIds.filter((id) => id !== "category");

      if (
        financeCandidates.length > 0 &&
        openFinanceTxPropertyDropdown(financeCandidates)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
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
      event.stopImmediatePropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, openRef, pathname]);
}
