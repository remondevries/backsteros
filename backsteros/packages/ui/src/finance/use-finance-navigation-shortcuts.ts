"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isFinanceSectionPath } from "../navigation/entity-routes.js";
import {
  DEFAULT_FINANCE_GO_NAVIGATION_ITEMS,
  type FinanceGoNavigationItem,
} from "./finance-nav.js";
import {
  clearFinanceLeaderSequence,
  isFinanceLeaderSequencePending,
  registerFinanceLeaderKeyPress,
} from "./finance-leader-sequence-gate.js";
import { clearGoLeaderSequence } from "../shortcuts/go-leader-sequence-gate.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "../shortcuts/shortcut-guards.js";

function findFinanceGoItemByLetter(
  letter: string,
  items: readonly FinanceGoNavigationItem[],
): FinanceGoNavigationItem | undefined {
  return items.find((item) => item.letter === letter);
}

/**
 * While in Finance: F → open Finance Go palette; F then letter → section nav
 * (mirrors G → Go destinations).
 */
export function useFinanceNavigationShortcuts({
  enabled = true,
  pathname,
  financeGoItems = DEFAULT_FINANCE_GO_NAVIGATION_ITEMS,
  openFinanceGo,
  closePalette,
  onNavigate,
}: {
  enabled?: boolean;
  pathname: string;
  financeGoItems?: readonly FinanceGoNavigationItem[];
  openFinanceGo: () => void;
  closePalette: () => void;
  onNavigate: (href: string) => void;
}) {
  const { openRef, modeRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isFinanceSectionPath(pathname)) {
        return;
      }

      const commandPaletteOpen = openRef.current ?? false;
      const commandPaletteMode = modeRef.current ?? "search";

      if (isBlockingModalOpen() && !commandPaletteOpen) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const quickFinanceNavPending =
        commandPaletteOpen &&
        commandPaletteMode === "finance-go" &&
        isFinanceLeaderSequencePending() &&
        Boolean(findFinanceGoItemByLetter(key, financeGoItems));

      if (!quickFinanceNavPending && !shouldHandleGlobalShortcut(event)) {
        return;
      }

      if (key === "f" && !event.shiftKey) {
        if (commandPaletteOpen) {
          return;
        }
        event.preventDefault();
        clearGoLeaderSequence();
        registerFinanceLeaderKeyPress();
        openFinanceGo();
        return;
      }

      if (!isFinanceLeaderSequencePending()) {
        return;
      }

      const binding = findFinanceGoItemByLetter(key, financeGoItems);
      clearFinanceLeaderSequence();

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
    enabled,
    financeGoItems,
    modeRef,
    onNavigate,
    openFinanceGo,
    openRef,
    pathname,
  ]);
}
