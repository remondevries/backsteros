"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { isBlockingModalOpen } from "../shortcuts/shortcut-guards.js";

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
  // Page overlays own Escape (collapse / close) before history back.
  if (
    document.querySelector(
      "[data-calendar-meeting-overlay], [data-calendar-task-overlay], [data-contact-overlay], [data-organization-overlay]",
    )
  ) {
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
  canGoBack = true,
  /** When true, Escape from xterm also triggers back (agent console task → list). */
  allowFromTerminal = false,
  onGoBack,
}: {
  enabled?: boolean;
  pathname: string;
  /** Prefer in-app history `canGoBack` over `window.history.length`. */
  canGoBack?: boolean;
  allowFromTerminal?: boolean;
  onGoBack: () => void;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const commandPaletteOpen = openRef.current ?? false;
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
  }, [allowFromTerminal, canGoBack, enabled, onGoBack, openRef, pathname]);
}
