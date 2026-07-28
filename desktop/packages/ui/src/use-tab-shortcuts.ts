"use client";

import { useEffect, useRef } from "react";

import { shouldHandleTabChromeShortcut } from "./shortcut-guards.js";

function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export type TabCycleDirection = "previous" | "next";

/**
 * ⌘⇧[ / ⌘⇧] — previous / next top product (app) tab.
 * In-page section pills use ⌥[ / ⌥] via {@link resolveSectionTabCycleShortcut}.
 */
export function resolveTabCycleShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code" | "key"
  >,
): TabCycleDirection | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || !event.shiftKey) {
    return null;
  }

  if (event.code === "BracketLeft" || event.key === "[") return "previous";
  if (event.code === "BracketRight" || event.key === "]") return "next";
  return null;
}

/**
 * ⌘T / ⌘⇧T / ⌘W / ⌘⇧[ / ⌘⇧] for app tabs.
 *
 * When `enabled` is false (e.g. file editor tabs own the shortcuts), ⌘⇧T
 * still reopens a closed app tab if `reopenClosedTab` is provided.
 *
 * Uses {@link shouldHandleTabChromeShortcut} by default so ⌘W still closes
 * the active product tab while focus is in the agent chat / editors —
 * not the native window-close accelerator.
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
  shouldHandle = shouldHandleTabChromeShortcut,
}: {
  enabled?: boolean;
  activeTabId: string;
  openNewTab: () => void;
  closeTab: (tabId: string) => void;
  activatePreviousTab: () => void;
  activateNextTab: () => void;
  /** ⌘⇧T — restore the most recently closed tab. Return true if one was restored. */
  reopenClosedTab?: () => boolean | void;
  /** Override focus/modal guards (defaults to tab-chrome: allow in editors). */
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
      if (!shouldHandleRef.current(event)) {
        return;
      }

      const cycle = resolveTabCycleShortcut(event);
      if (cycle != null) {
        if (!enabled) return;
        event.preventDefault();
        event.stopPropagation();
        if (cycle === "previous") {
          activatePreviousTabRef.current();
        } else {
          activateNextTabRef.current();
        }
        return;
      }

      if (!hasPrimaryModifier(event) || event.altKey) {
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
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
