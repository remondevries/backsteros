"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isAnyLeaderSequencePending } from "../shortcuts/leader-sequence-gate.js";
import { shouldYieldComposeToFinanceTxCategory } from "../tasks/task-property-dropdown-keys.js";

/**
 * Global C shortcut to open compose (matches Next useComposeShortcut).
 * Yields only while a finance transaction row is keyboard-highlighted.
 */
export function useComposeShortcut({
  enabled = true,
  onCompose,
}: {
  enabled?: boolean;
  onCompose: () => void;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (openRef.current) return;
      if (isAnyLeaderSequencePending()) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const isC =
        (event.key.length === 1 && event.key.toLowerCase() === "c") ||
        event.code === "KeyC";
      if (!isC) return;

      // Highlighted transaction owns plain C for category.
      if (shouldYieldComposeToFinanceTxCategory()) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest(".cm-editor") ||
          target.closest("[role='textbox']")
        ) {
          return;
        }
      }

      event.preventDefault();
      event.stopPropagation();
      onCompose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onCompose, openRef]);
}
