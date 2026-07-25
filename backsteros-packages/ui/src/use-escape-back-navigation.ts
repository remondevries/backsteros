"use client";

import { useEffect } from "react";

import { isBlockingModalOpen } from "./shortcut-guards.js";

function shouldHandleEscapeBack(
  event: KeyboardEvent,
  commandPaletteOpen: boolean,
  allowFromTerminal: boolean,
): boolean {
  if (event.key !== "Escape") return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  if (commandPaletteOpen) return false;
  if (isBlockingModalOpen()) return false;
  if (document.querySelector("[data-searchable-dropdown-panel]")) {
    return false;
  }

  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    const inTerminal = Boolean(
      target.closest(".xterm") ||
        target.classList.contains("xterm-helper-textarea"),
    );
    if (inTerminal) {
      // Agent console: Escape leaves the task and returns to the task list.
      return allowFromTerminal;
    }
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable ||
      target.closest(".cm-editor") ||
      target.closest("[role='textbox']")
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Escape → previous page via the in-app navigation history stack
 * (Next escape-back parity).
 */
export function useEscapeBackNavigation({
  enabled = true,
  pathname,
  commandPaletteOpen = false,
  canGoBack = true,
  /** When true, Escape from xterm also triggers back (agent console task → list). */
  allowFromTerminal = false,
  onGoBack,
}: {
  enabled?: boolean;
  pathname: string;
  commandPaletteOpen?: boolean;
  /** Prefer in-app history `canGoBack` over `window.history.length`. */
  canGoBack?: boolean;
  allowFromTerminal?: boolean;
  onGoBack: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        !shouldHandleEscapeBack(event, commandPaletteOpen, allowFromTerminal)
      ) {
        return;
      }

      // Match Next: section roots that are themselves list homes.
      if (pathname === "/" || pathname === "/projects" || pathname === "/tasks") {
        return;
      }

      if (!canGoBack) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onGoBack();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    allowFromTerminal,
    canGoBack,
    commandPaletteOpen,
    enabled,
    onGoBack,
    pathname,
  ]);
}
