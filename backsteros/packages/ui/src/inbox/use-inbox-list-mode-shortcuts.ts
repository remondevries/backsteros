"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isSearchableDropdownPanelOpen } from "../list-nav/should-handle-list-keyboard-navigation.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";
import {
  resolveInboxListModeFromShortcutKey,
  type InboxListMode,
} from "./inbox-list-mode.js";

/**
 * `1` / `2` / `3` → Notifications / Messages / Agents (inbox side-panel footer).
 */
export function useInboxListModeShortcuts({
  enabled = true,
  mode,
  onModeChange,
}: {
  enabled?: boolean;
  mode?: InboxListMode;
  onModeChange: (mode: InboxListMode) => void;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      if (isSearchableDropdownPanelOpen()) return;
      if (event.repeat) return;

      const nextMode = resolveInboxListModeFromShortcutKey(event.key, event);
      if (!nextMode) return;
      if (mode != null && nextMode === mode) return;

      event.preventDefault();
      event.stopPropagation();
      onModeChange(nextMode);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, mode, onModeChange, openRef]);
}
