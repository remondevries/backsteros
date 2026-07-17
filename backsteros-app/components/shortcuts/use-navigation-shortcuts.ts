"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import {
  clearGoLeaderSequence,
  isGoLeaderSequencePending,
  registerGoLeaderKeyPress,
} from "@/lib/shortcuts/go-leader-sequence-gate";
import { findNavigationShortcutByLetter } from "@/lib/shortcuts/navigation-shortcut-bindings";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

function isGoQuickNavigationKey(key: string): boolean {
  return findNavigationShortcutByLetter(key) !== undefined;
}

export function useNavigationShortcuts({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const router = useRouter();
  const { open: commandPaletteOpen, mode, openGo, setOpen } =
    useCommandPalette();

  useEffect(() => {
    if (!enabled) {
      return;
    }

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
        mode === "go" &&
        isGoLeaderSequencePending() &&
        isGoQuickNavigationKey(key);

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

      const binding = findNavigationShortcutByLetter(key);
      clearGoLeaderSequence();

      if (!binding) {
        return;
      }

      event.preventDefault();
      setOpen(false);
      router.push(binding.href);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, mode, openGo, router, setOpen]);
}
