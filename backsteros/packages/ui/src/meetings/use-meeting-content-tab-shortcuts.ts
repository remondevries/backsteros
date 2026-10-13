"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isSearchableDropdownPanelOpen } from "../list-nav/should-handle-list-keyboard-navigation.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";
import {
  resolveMeetingContentTabFromShortcutKey,
  type MeetingContentTab,
} from "./meeting-content-tab-shortcuts.js";

/**
 * Digit keys switch among the visible meeting content tabs on the open panel.
 * Calendar page-mode digit shortcuts must be disabled while this is active.
 */
export function useMeetingContentTabShortcuts({
  enabled = true,
  activeTab,
  onTabChange,
  visibleTabs,
}: {
  enabled?: boolean;
  activeTab: MeetingContentTab;
  onTabChange: (tab: MeetingContentTab) => void;
  visibleTabs: readonly MeetingContentTab[];
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      if (isSearchableDropdownPanelOpen()) return;
      if (event.repeat) return;

      const nextTab = resolveMeetingContentTabFromShortcutKey(
        event.key,
        event,
        visibleTabs,
      );
      if (!nextTab) return;
      if (nextTab === activeTab) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onTabChange(nextTab);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeTab, enabled, onTabChange, openRef, visibleTabs]);
}
