import { type RefObject, useEffect } from "react";

import { useCommandPalette } from "../components/command-palette/command-palette-context.js";
import { isSearchableDropdownPanelOpen } from "../list-nav/should-handle-list-keyboard-navigation.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";
import {
  isCalendarDateNavigationPopoverOpen,
  resolveCalendarDateNavigationAction,
} from "./calendar-date-navigation-shortcuts.js";

/** Subset of FullCalendar API used for date-nav chrome. */
export type CalendarDateNavApi = {
  prev: () => void;
  next: () => void;
  today?: () => void;
};

/**
 * ArrowLeft / ArrowRight → prev / next on the FullCalendar API.
 * Digit keys for Calendar / Timetracking / Availability live on
 * `useCalendarPageModeShortcuts`.
 */
export function useCalendarDateNavigationShortcuts({
  calendarApiRef,
  enabled = true,
}: {
  calendarApiRef: RefObject<CalendarDateNavApi | null>;
  enabled?: boolean;
  /** @deprecated Digit shortcuts now switch page mode; ignored. */
  onViewModeChange?: (mode: never) => void;
  /** @deprecated Digit shortcuts now switch page mode; ignored. */
  availableViewModes?: readonly string[];
}) {
  const { open: commandPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      if (isSearchableDropdownPanelOpen()) return;
      if (isCalendarDateNavigationPopoverOpen()) return;
      if (event.repeat) return;

      const action = resolveCalendarDateNavigationAction(event.key, event);
      if (!action) return;

      const api = calendarApiRef.current;
      if (!api) return;

      event.preventDefault();
      event.stopPropagation();
      if (action === "prev") {
        api.prev();
      } else {
        api.next();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [calendarApiRef, commandPaletteOpen, enabled]);
}
