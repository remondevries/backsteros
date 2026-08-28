"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import {
  DEFAULT_GO_NAVIGATION_ITEMS,
  type GoNavigationItem,
} from "../command-palette/command-palette.js";
import { clearFinanceLeaderSequence } from "../finance/finance-leader-sequence-gate.js";
import {
  clearGoFinanceChord,
  consumeGoFinanceChordForContext,
  isGoFinanceChordPending,
  registerGoFinanceChord,
} from "../finance/go-finance-chord-gate.js";
import {
  clearGoLeaderSequence,
  isGoLeaderSequencePending,
  registerGoLeaderKeyPress,
} from "../shortcuts/go-leader-sequence-gate.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "../shortcuts/shortcut-guards.js";
import { shouldYieldGoNavigationToFinanceTxGoal } from "../tasks/task-property-dropdown-keys.js";
import { afterNextPaint } from "../timing/after-next-paint.js";

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
  goItems = DEFAULT_GO_NAVIGATION_ITEMS,
  openGo,
  openFinanceGo,
  closePalette,
  onNavigate,
}: {
  enabled?: boolean;
  goItems?: GoNavigationItem[];
  openGo: () => void;
  openFinanceGo: () => void;
  closePalette: () => void;
  onNavigate: (href: string) => void;
}) {
  const { openRef, modeRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const commandPaletteOpen = openRef.current ?? false;
      const commandPaletteMode = modeRef.current ?? "search";

      if (isBlockingModalOpen() && !commandPaletteOpen) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "g" && !event.shiftKey && !commandPaletteOpen) {
        if (!shouldYieldGoNavigationToFinanceTxGoal()) {
          event.preventDefault();
          clearFinanceLeaderSequence();
          clearGoFinanceChord();
          registerGoLeaderKeyPress();
          openGo();
          return;
        }
      }

      // G then letter — handle before shouldHandleGlobalShortcut so fast chords
      // work while focus is still in an editor (T arrives before palette focus).
      if (isGoLeaderSequencePending()) {
        const leaderBinding = findGoItemByLetter(key, goItems);
        if (leaderBinding) {
          event.preventDefault();
          event.stopPropagation();
          clearGoLeaderSequence();
          clearGoFinanceChord();
          if (leaderBinding.id === "finance") {
            registerGoFinanceChord(leaderBinding.href, () => {
              onNavigate(leaderBinding.href);
              afterNextPaint(() => closePalette());
            });
            return;
          }
          // Navigate first (warm keep-alive flip), then tear down the palette
          // after paint — same order as search-select. Closing first costs a
          // React unmount frame before left-nav-speed navigation can start.
          onNavigate(leaderBinding.href);
          afterNextPaint(() => closePalette());
          return;
        }
        if (key !== "g") {
          clearGoLeaderSequence();
        }
      }

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

      if (key === "g" && !event.shiftKey && commandPaletteOpen) {
        if (commandPaletteMode !== "go") {
          event.preventDefault();
          registerGoLeaderKeyPress();
          openGo();
        }
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearGoFinanceChord();
    };
  }, [
    closePalette,
    enabled,
    goItems,
    modeRef,
    onNavigate,
    openFinanceGo,
    openGo,
    openRef,
  ]);
}
