"use client";

import { useEffect } from "react";

import {
  DEFAULT_GO_NAVIGATION_ITEMS,
  type GoNavigationItem,
} from "./command-palette.js";
import { clearFinanceLeaderSequence } from "./finance-leader-sequence-gate.js";
import {
  clearGoFinanceChord,
  consumeGoFinanceChordForContext,
  isGoFinanceChordPending,
  registerGoFinanceChord,
} from "./go-finance-chord-gate.js";
import {
  clearGoLeaderSequence,
  isGoLeaderSequencePending,
  registerGoLeaderKeyPress,
} from "./go-leader-sequence-gate.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "./shortcut-guards.js";
import { shouldYieldGoNavigationToFinanceTxGoal } from "./task-property-dropdown-keys.js";

function findGoItemByLetter(
  letter: string,
  items: GoNavigationItem[],
): GoNavigationItem | undefined {
  return items.find((item) => item.letter === letter);
}

/**
 * G → open Go palette; G then letter → navigate.
 * G then F waits briefly for Space (Finance context) before navigating to Finance.
 * Typing `f` then Space in the open Go search also enters Finance context.
 */
export function useNavigationShortcuts({
  enabled = true,
  commandPaletteOpen = false,
  commandPaletteMode = "all",
  goItems = DEFAULT_GO_NAVIGATION_ITEMS,
  openGo,
  openFinanceGo,
  closePalette,
  onNavigate,
}: {
  enabled?: boolean;
  commandPaletteOpen?: boolean;
  commandPaletteMode?: string;
  goItems?: GoNavigationItem[];
  openGo: () => void;
  openFinanceGo: () => void;
  closePalette: () => void;
  onNavigate: (href: string) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    if (!commandPaletteOpen) {
      clearGoFinanceChord();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isBlockingModalOpen() && !commandPaletteOpen) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      // G F then Space → Finance go context (before the navigate timeout).
      if (
        (key === " " || key === "spacebar") &&
        isGoFinanceChordPending() &&
        commandPaletteOpen &&
        commandPaletteMode === "go"
      ) {
        event.preventDefault();
        event.stopPropagation();
        consumeGoFinanceChordForContext();
        openFinanceGo();
        return;
      }

      if (isGoFinanceChordPending() && key !== "f") {
        // Any other key cancels auto-navigate to Finance.
        clearGoFinanceChord();
      }

      const financeChordQuickKey =
        commandPaletteOpen &&
        commandPaletteMode === "go" &&
        isGoLeaderSequencePending() &&
        findGoItemByLetter(key, goItems)?.id === "finance";

      const quickGoNavPending =
        commandPaletteOpen &&
        commandPaletteMode === "go" &&
        isGoLeaderSequencePending() &&
        Boolean(findGoItemByLetter(key, goItems));

      if (
        !financeChordQuickKey &&
        !quickGoNavPending &&
        !shouldHandleGlobalShortcut(event)
      ) {
        return;
      }

      if (key === "g" && !event.shiftKey) {
        if (commandPaletteOpen) {
          return;
        }
        // Finance tx detail owns plain G for the goal dropdown.
        if (shouldYieldGoNavigationToFinanceTxGoal()) {
          return;
        }
        event.preventDefault();
        clearFinanceLeaderSequence();
        clearGoFinanceChord();
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

      // G F: wait for Space (context) or timeout (navigate to Finance).
      if (binding.id === "finance") {
        registerGoFinanceChord(binding.href, () => {
          closePalette();
          onNavigate(binding.href);
        });
        return;
      }

      clearGoFinanceChord();
      closePalette();
      onNavigate(binding.href);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearGoFinanceChord();
    };
  }, [
    closePalette,
    commandPaletteMode,
    commandPaletteOpen,
    enabled,
    goItems,
    onNavigate,
    openFinanceGo,
    openGo,
  ]);
}
