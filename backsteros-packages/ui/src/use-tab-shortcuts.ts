"use client";

import { useEffect } from "react";

import { shouldHandleGlobalShortcut } from "./shortcut-guards.js";

function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * ⌘T / ⌘W / ⌘⇧[ / ⌘⇧] for app tabs (Next useTabShortcuts).
 */
export function useTabShortcuts({
  enabled = true,
  activeTabId,
  openNewTab,
  closeTab,
  activatePreviousTab,
  activateNextTab,
}: {
  enabled?: boolean;
  activeTabId: string;
  openNewTab: () => void;
  closeTab: (tabId: string) => void;
  activatePreviousTab: () => void;
  activateNextTab: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!hasPrimaryModifier(event) || event.altKey) {
        return;
      }

      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "t" && !event.shiftKey) {
        event.preventDefault();
        openNewTab();
        return;
      }

      if (key === "w" && !event.shiftKey) {
        event.preventDefault();
        closeTab(activeTabId);
        return;
      }

      if (
        event.shiftKey &&
        (event.key === "[" || event.code === "BracketLeft")
      ) {
        event.preventDefault();
        activatePreviousTab();
        return;
      }

      if (
        event.shiftKey &&
        (event.key === "]" || event.code === "BracketRight")
      ) {
        event.preventDefault();
        activateNextTab();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    activateNextTab,
    activatePreviousTab,
    activeTabId,
    closeTab,
    enabled,
    openNewTab,
  ]);
}
