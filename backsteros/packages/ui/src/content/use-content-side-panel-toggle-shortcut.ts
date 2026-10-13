"use client";

import { useEffect, useRef } from "react";

import { isContentSidePanelToggleShortcut } from "./content-side-panel-toggle-shortcut.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";

/**
 * ⇧[ toggles the left content side panel (inbox / journal / … list column).
 * Plain ] is reserved for the right agent panel.
 *
 * Capture phase so we reliably own the chord whenever a list panel is shown,
 * without depending on bubble order vs keep-alive task layouts.
 */
export function useContentSidePanelToggleShortcut({
  enabled = true,
  onToggle,
}: {
  enabled?: boolean;
  onToggle: () => void;
}) {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

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
      // Same-target capture listeners (e.g. task-detail ⇧[) must not also run.
      event.stopImmediatePropagation();
      onToggleRef.current();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
