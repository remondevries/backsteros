"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
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
}: {
  bodyViewMode: EmailThreadBodyViewMode;
  onBodyViewModeChange: (mode: EmailThreadBodyViewMode) => void;
  enabled?: boolean;
  pathname?: string;
}) {
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
  }, [bodyViewMode, enabled, onBodyViewModeChange, openRef, pathname]);
}
