"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import {
  normalizeTabLocation,
  parseSectionTabIndex,
  resolveAdjacentSectionTabHref,
  resolveDesktopSectionTabHrefs,
  resolveSectionTabCycleShortcut,
} from "./section-tab-hrefs.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";

/**
 * Number keys switch list/entity section tabs (Next useSectionTabShortcuts).
 * ⌥[ / ⌥] cycle previous / next among those same tabs.
 * On letter detail, 1–5 also select PDF attachments when no section tabs apply
 * (e.g. global `/letters/…`); project/org/contact letter routes prefer section tabs.
 * On codebase projects, 1–5 (and ⌥[ / ⌥]) switch Tasks / Files / Docs /
 * Commits / PRs while the development workbench is mounted.
 * Disabled on task detail routes so 1–5 do not leave the single-task layout.
 */
export function useSectionTabShortcuts({
  enabled = true,
  pathname,
  search = "",
  onNavigate,
}: {
  enabled?: boolean;
  pathname: string;
  search?: string;
  onNavigate: (href: string) => void;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) return;
      if (!shouldHandleGlobalShortcut(event)) return;

      const cycle = resolveSectionTabCycleShortcut(event);
      if (cycle != null) {
        const tabHrefs = resolveDesktopSectionTabHrefs(pathname, search);
        if (!tabHrefs?.length) return;

        const targetHref = resolveAdjacentSectionTabHref(
          tabHrefs,
          pathname,
          search,
          cycle,
        );
        if (!targetHref) return;

        const current = normalizeTabLocation(`${pathname}${search}`);
        if (normalizeTabLocation(targetHref) === current) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        onNavigate(targetHref);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const tabIndex = parseSectionTabIndex(event.key);
      if (tabIndex == null) return;

      const tabHrefs = resolveDesktopSectionTabHrefs(pathname, search);
      if (!tabHrefs?.length) return;

      const targetHref = tabHrefs[tabIndex];
      if (!targetHref) return;

      const current = normalizeTabLocation(`${pathname}${search}`);
      if (normalizeTabLocation(targetHref) === current) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      onNavigate(targetHref);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onNavigate, openRef, pathname, search]);
}
