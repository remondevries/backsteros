"use client";

import { useEffect } from "react";

import { isContentSidePanelToggleShortcut } from "./content-side-panel-toggle-shortcut.js";
import { shouldHandleGlobalShortcut } from "./shortcut-guards.js";

/**
 * ⇧[ / ] toggles the content side panel (Next useContentSidePanelToggleShortcut).
 */
export function useContentSidePanelToggleShortcut({
  enabled = true,
  onToggle,
}: {
  enabled?: boolean;
  onToggle: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isContentSidePanelToggleShortcut(event)) {
        return;
      }

      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      event.preventDefault();
      onToggle();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onToggle]);
}
