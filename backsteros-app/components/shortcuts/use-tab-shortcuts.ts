"use client";

import { useEffect } from "react";

import { useTabs } from "@/components/shell/tabs-provider";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export function useTabShortcuts({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const {
    activeTabId,
    closeTab,
    openNewTab,
    activatePreviousTab,
    activateNextTab,
  } = useTabs();

  useEffect(() => {
    if (!enabled) {
      return;
    }

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
