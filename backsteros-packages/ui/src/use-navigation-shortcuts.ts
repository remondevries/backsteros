"use client";

import { useEffect } from "react";

import {
  DEFAULT_GO_NAVIGATION_ITEMS,
  type GoNavigationItem,
} from "./command-palette.js";
import {
  clearGoLeaderSequence,
  isGoLeaderSequencePending,
  registerGoLeaderKeyPress,
} from "./go-leader-sequence-gate.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "./shortcut-guards.js";

function findGoItemByLetter(
  letter: string,
  items: GoNavigationItem[],
): GoNavigationItem | undefined {
  return items.find((item) => item.letter === letter);
}

/**
 * G → open Go palette; G then letter → navigate (Next useNavigationShortcuts).
 */
export function useNavigationShortcuts({
  enabled = true,
  commandPaletteOpen = false,
  commandPaletteMode = "all",
  goItems = DEFAULT_GO_NAVIGATION_ITEMS,
  openGo,
  closePalette,
  onNavigate,
}: {
  enabled?: boolean;
  commandPaletteOpen?: boolean;
  commandPaletteMode?: string;
  goItems?: GoNavigationItem[];
  openGo: () => void;
  closePalette: () => void;
  onNavigate: (href: string) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isBlockingModalOpen() && !commandPaletteOpen) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const quickGoNavPending =
        commandPaletteOpen &&
        commandPaletteMode === "go" &&
        isGoLeaderSequencePending() &&
        Boolean(findGoItemByLetter(key, goItems));

      if (!quickGoNavPending && !shouldHandleGlobalShortcut(event)) {
        return;
      }

      if (key === "g" && !event.shiftKey) {
        if (commandPaletteOpen) {
          return;
        }
        event.preventDefault();
        registerGoLeaderKeyPress();
        openGo();
        return;
      }

      if (!isGoLeaderSequencePending()) {
        return;
      }

      const binding = findGoItemByLetter(key, goItems);
      clearGoLeaderSequence();

      if (!binding) {
        return;
      }

      event.preventDefault();
      closePalette();
      onNavigate(binding.href);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    closePalette,
    commandPaletteMode,
    commandPaletteOpen,
    enabled,
    goItems,
    onNavigate,
    openGo,
  ]);
}
