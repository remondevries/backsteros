"use client";

import { useEffect, useRef } from "react";

import { shouldHandleGlobalShortcut } from "./shortcut-guards.js";

function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * ⌘T / ⌘⇧T / ⌘W / ⌘⇧[ / ⌘⇧] for app tabs.
 *
 * When `enabled` is false (e.g. file editor tabs own the shortcuts), ⌘⇧T
 * still reopens a closed app tab if `reopenClosedTab` is provided.
 *
 * Handlers are read from refs so tab switches do not rebind the capture
 * keydown listener on every `activeTabId` change.
 */
export function useTabShortcuts({
  enabled = true,
  activeTabId,
  openNewTab,
  closeTab,
  activatePreviousTab,
  activateNextTab,
  reopenClosedTab,
  shouldHandle = shouldHandleGlobalShortcut,
}: {
  enabled?: boolean;
  activeTabId: string;
  openNewTab: () => void;
  closeTab: (tabId: string) => void;
  activatePreviousTab: () => void;
  activateNextTab: () => void;
  /** ⌘⇧T — restore the most recently closed tab. Return true if one was restored. */
  reopenClosedTab?: () => boolean | void;
  /** Override focus/modal guards (e.g. allow while xterm is focused). */
  shouldHandle?: (event: KeyboardEvent) => boolean;
}) {
  const shouldHandleRef = useRef(shouldHandle);
  shouldHandleRef.current = shouldHandle;
  const reopenClosedTabRef = useRef(reopenClosedTab);
  reopenClosedTabRef.current = reopenClosedTab;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const openNewTabRef = useRef(openNewTab);
  openNewTabRef.current = openNewTab;
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;
  const activatePreviousTabRef = useRef(activatePreviousTab);
  activatePreviousTabRef.current = activatePreviousTab;
  const activateNextTabRef = useRef(activateNextTab);
  activateNextTabRef.current = activateNextTab;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!hasPrimaryModifier(event) || event.altKey) {
        return;
      }

      if (!shouldHandleRef.current(event)) {
        return;
      }

      const isT =
        event.key.toLowerCase() === "t" || event.code === "KeyT";

      // ⌘⇧T — reopen closed tab (allowed even when other tab shortcuts yield).
      if (isT && event.shiftKey) {
        if (!reopenClosedTabRef.current) return;
        const restored = reopenClosedTabRef.current();
        if (restored === false) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!enabled) return;

      if (isT) {
        event.preventDefault();
        openNewTabRef.current();
        return;
      }

      if (
        !event.shiftKey &&
        (event.key.toLowerCase() === "w" || event.code === "KeyW")
      ) {
        event.preventDefault();
        closeTabRef.current(activeTabIdRef.current);
        return;
      }

      if (
        event.shiftKey &&
        (event.key === "[" || event.code === "BracketLeft")
      ) {
        event.preventDefault();
        activatePreviousTabRef.current();
        return;
      }

      if (
        event.shiftKey &&
        (event.key === "]" || event.code === "BracketRight")
      ) {
        event.preventDefault();
        activateNextTabRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
