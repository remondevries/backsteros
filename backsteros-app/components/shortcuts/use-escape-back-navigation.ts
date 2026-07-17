"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { useNavigationHistory } from "@/components/navigation/navigation-history-provider";
import { shouldHandleEscapeBackNavigation } from "@/lib/shortcuts/should-handle-escape-back-navigation";

/**
 * Escape → previous page via the in-app navigation history stack.
 * Skips inputs/dropdowns/palette (title fields handle Escape themselves).
 */
export function useEscapeBackNavigation({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const pathname = usePathname();
  const { open: commandPaletteOpen } = useCommandPalette();
  const { canGoBack, goBack } = useNavigationHistory();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        !shouldHandleEscapeBackNavigation(event, { commandPaletteOpen })
      ) {
        return;
      }

      if (pathname === "/" || pathname === "/projects") {
        return;
      }

      if (!canGoBack) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      goBack();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canGoBack, commandPaletteOpen, enabled, goBack, pathname]);
}
