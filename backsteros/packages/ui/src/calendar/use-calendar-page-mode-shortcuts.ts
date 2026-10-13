"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isSearchableDropdownPanelOpen } from "../list-nav/should-handle-list-keyboard-navigation.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";
import {
  calendarPageModes,
  resolveCalendarPageModeFromShortcutKey,
  type CalendarPageMode,
} from "./calendar-page-mode.js";

/**
 * `1` / `2` / `3` → Calendar / Timetracking / Availability.
 */
export function useCalendarPageModeShortcuts({
  enabled = true,
  pageMode,
  onPageModeChange,
  availablePageModes = calendarPageModes,
}: {
  enabled?: boolean;
  pageMode?: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
  availablePageModes?: readonly CalendarPageMode[];
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      if (isSearchableDropdownPanelOpen()) return;
      if (event.repeat) return;

      const nextMode = resolveCalendarPageModeFromShortcutKey(
        event.key,
        event,
        availablePageModes,
      );
      if (!nextMode) return;
      if (pageMode != null && nextMode === pageMode) return;

      event.preventDefault();
      event.stopPropagation();
      onPageModeChange(nextMode);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    availablePageModes,
    enabled,
    onPageModeChange,
    openRef,
    pageMode,
  ]);
}
