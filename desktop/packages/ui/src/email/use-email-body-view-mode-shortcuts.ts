"use client";

import { useEffect } from "react";

import type { EmailThreadBodyViewMode } from "./email.js";
import {
  resolveEmailBodyViewModeFromShortcut,
  shouldHandleEmailBodyViewModeShortcut,
} from "./email-body-view-mode-shortcuts.js";

export function useEmailBodyViewModeShortcuts({
  bodyViewMode,
  onBodyViewModeChange,
  enabled = true,
  pathname,
  commandPaletteOpen = false,
}: {
  bodyViewMode: EmailThreadBodyViewMode;
  onBodyViewModeChange: (mode: EmailThreadBodyViewMode) => void;
  enabled?: boolean;
  pathname?: string;
  commandPaletteOpen?: boolean;
}) {
  useEffect(() => {
    if (!enabled || commandPaletteOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const routePath = pathname ?? window.location.pathname;
      if (!shouldHandleEmailBodyViewModeShortcut(event, routePath)) {
        return;
      }

      const next = resolveEmailBodyViewModeFromShortcut(bodyViewMode, event);
      if (!next || next === bodyViewMode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onBodyViewModeChange(next);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    bodyViewMode,
    commandPaletteOpen,
    enabled,
    onBodyViewModeChange,
    pathname,
  ]);
}
