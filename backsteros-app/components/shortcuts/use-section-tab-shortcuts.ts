"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import {
  getCurrentTabLocation,
  normalizeTabLocation,
  parseSectionTabIndex,
  resolveSectionTabHrefs,
} from "@/lib/shortcuts/resolve-section-tab-hrefs";
import { shouldHandleSectionTabNavigation } from "@/lib/shortcuts/should-handle-section-tab-navigation";

export function useSectionTabShortcuts({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { open: commandPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) {
        return;
      }

      if (!shouldHandleSectionTabNavigation(event)) {
        return;
      }

      const tabIndex = parseSectionTabIndex(event.key);
      if (tabIndex == null) {
        return;
      }

      const tabHrefs = resolveSectionTabHrefs(pathname, window.location.search);
      if (!tabHrefs?.length) {
        return;
      }

      const targetHref = tabHrefs[tabIndex];
      if (!targetHref) {
        return;
      }

      const currentLocation = getCurrentTabLocation(
        pathname,
        window.location.search,
      );
      if (normalizeTabLocation(targetHref) === currentLocation) {
        return;
      }

      event.preventDefault();
      // Prefer section tabs over letter PDF attachment 1–5 on the same key.
      event.stopImmediatePropagation();
      router.push(targetHref);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, pathname, router]);
}
