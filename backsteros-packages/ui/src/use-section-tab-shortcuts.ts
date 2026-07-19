"use client";

import { useEffect } from "react";

import { parseLetterPdfAttachmentShortcutIndex } from "./letter-pdf-attachment-shortcut.js";
import { isLetterDetailPath } from "./letters.js";
import {
  normalizeTabLocation,
  parseSectionTabIndex,
  resolveDesktopSectionTabHrefs,
} from "./section-tab-hrefs.js";
import { shouldHandleGlobalShortcut } from "./shortcut-guards.js";

/**
 * Number keys switch list/entity section tabs (Next useSectionTabShortcuts).
 */
export function useSectionTabShortcuts({
  enabled = true,
  pathname,
  search = "",
  commandPaletteOpen = false,
  onNavigate,
}: {
  enabled?: boolean;
  pathname: string;
  search?: string;
  commandPaletteOpen?: boolean;
  onNavigate: (href: string) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;

      // Letter detail reuses 1–5 for PDF attachments.
      if (
        isLetterDetailPath(pathname) &&
        parseLetterPdfAttachmentShortcutIndex(event) != null
      ) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) return;

      const tabIndex = parseSectionTabIndex(event.key);
      if (tabIndex == null) return;

      const tabHrefs = resolveDesktopSectionTabHrefs(pathname, search);
      if (!tabHrefs?.length) return;

      const targetHref = tabHrefs[tabIndex];
      if (!targetHref) return;

      const current = normalizeTabLocation(`${pathname}${search}`);
      if (normalizeTabLocation(targetHref) === current) return;

      event.preventDefault();
      event.stopPropagation();
      onNavigate(targetHref);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, onNavigate, pathname, search]);
}
