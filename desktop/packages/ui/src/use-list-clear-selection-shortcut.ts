"use client";

import { useEffect } from "react";

import {
  isSearchableDropdownMenuOpen,
  shouldHandleClearSelectionShortcut,
} from "./list-clear-selection-shortcut.js";
import { requestCloseSearchableDropdowns } from "./searchable-dropdown-events.js";
import { isBlockingModalOpen } from "./shortcut-guards.js";

type EscapeHandler = () => void | Promise<void>;

/**
 * Stack of active clear-selection handlers (most recent wins). Lets Escape
 * clear whichever multi-select list is mounted before escape-back / zone nav.
 */
const clearSelectionHandlers: EscapeHandler[] = [];

/**
 * Stack of open detail dismiss handlers (e.g. transaction side panel).
 * Runs after closing dropdowns and before clearing multi-select.
 */
const dismissDetailHandlers: EscapeHandler[] = [];

let windowListenersInstalled = false;

function runTopHandler(handlers: EscapeHandler[]): boolean {
  const handler = handlers[handlers.length - 1];
  if (!handler) return false;
  void handler();
  return true;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.repeat) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return;
  }
  if (isBlockingModalOpen()) return;

  // Open bulk/property menus: first Escape closes the menu only.
  if (isSearchableDropdownMenuOpen()) {
    requestCloseSearchableDropdowns();
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  // Open list detail (transaction pane, etc.): close before multi-select / nav.
  if (
    shouldHandleClearSelectionShortcut(
      event,
      dismissDetailHandlers.length > 0,
    ) &&
    runTopHandler(dismissDetailHandlers)
  ) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (
    !shouldHandleClearSelectionShortcut(
      event,
      clearSelectionHandlers.length > 0,
    )
  ) {
    return;
  }

  if (!runTopHandler(clearSelectionHandlers)) return;

  event.preventDefault();
  event.stopPropagation();
}

function ensureWindowListeners() {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  // Capture + early install (app shell): beat escape-back and list zone Escape.
  window.addEventListener("keydown", onKeyDown, true);
}

/** Install once from the app shell so Escape clears selection before nav. */
export function installClearSelectionShortcutListeners() {
  ensureWindowListeners();
}

function useEscapeHandlerStack({
  enabled = true,
  onEscape,
  handlers,
}: {
  enabled?: boolean;
  onEscape: (() => void | Promise<void>) | null | undefined;
  handlers: EscapeHandler[];
}) {
  useEffect(() => {
    ensureWindowListeners();
  }, []);

  useEffect(() => {
    if (!enabled || !onEscape) return;

    handlers.push(onEscape);
    return () => {
      const index = handlers.lastIndexOf(onEscape);
      if (index >= 0) handlers.splice(index, 1);
    };
  }, [enabled, handlers, onEscape]);
}

/**
 * Escape clears the active multi-select when at least one row is selected.
 * Window listeners are installed once for the app lifetime.
 */
export function useListClearSelectionShortcut({
  enabled = true,
  onClear,
}: {
  enabled?: boolean;
  onClear: (() => void | Promise<void>) | null | undefined;
}) {
  useEscapeHandlerStack({
    enabled,
    onEscape: onClear,
    handlers: clearSelectionHandlers,
  });
}

/**
 * Escape dismisses an open list detail pane (e.g. transaction on the right).
 * Runs after dropdown close and before multi-select clear / escape-back.
 */
export function useListDismissDetailShortcut({
  enabled = true,
  onDismiss,
}: {
  enabled?: boolean;
  onDismiss: (() => void | Promise<void>) | null | undefined;
}) {
  useEscapeHandlerStack({
    enabled,
    onEscape: onDismiss,
    handlers: dismissDetailHandlers,
  });
}
