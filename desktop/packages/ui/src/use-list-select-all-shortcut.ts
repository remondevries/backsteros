"use client";

import { useEffect } from "react";

import {
  SELECT_ALL_EVENT,
  isSelectAllShortcut,
  selectAllInFocusedEditable,
  shouldHandleSelectAllShortcut,
} from "./list-select-all-shortcut.js";
import { isBlockingModalOpen, isEditableShortcutTarget } from "./shortcut-guards.js";

type SelectAllHandler = () => void | Promise<void>;

/**
 * Stack of active list select-all handlers (most recent wins). Lets the
 * native ⌘A menu event reach whichever multi-select list is mounted.
 */
const selectAllHandlers: SelectAllHandler[] = [];

let windowListenersInstalled = false;

function runListSelectAll(): boolean {
  const handler = selectAllHandlers[selectAllHandlers.length - 1];
  if (!handler) return false;
  void handler();
  window.getSelection()?.removeAllRanges();
  return true;
}

/**
 * Shared entry for ⌘A / Ctrl+A and the Tauri `backsteros:select-all` menu event.
 * Editable fields keep text select-all; otherwise the active list selects rows.
 */
export function handleSelectAllRequest(event?: Event): boolean {
  if (isBlockingModalOpen()) return false;

  const active =
    typeof document !== "undefined" ? document.activeElement : null;
  if (
    isEditableShortcutTarget(event?.target ?? null) ||
    isEditableShortcutTarget(active)
  ) {
    return selectAllInFocusedEditable(active);
  }

  if (runListSelectAll()) return true;

  // No list handler — fall back to selecting page content (previous native behavior).
  try {
    return document.execCommand("selectAll");
  } catch {
    return false;
  }
}

function onNativeSelectAll(event: Event) {
  if (handleSelectAllRequest(event)) {
    event.preventDefault?.();
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (!isSelectAllShortcut(event)) return;

  if (
    isEditableShortcutTarget(event.target) ||
    isEditableShortcutTarget(document.activeElement)
  ) {
    if (selectAllInFocusedEditable(document.activeElement)) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  if (!shouldHandleSelectAllShortcut(event, selectAllHandlers.length > 0)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  runListSelectAll();
}

function ensureWindowListeners() {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  window.addEventListener(SELECT_ALL_EVENT, onNativeSelectAll);
  // Capture: match other global shortcuts and beat default page select-all.
  window.addEventListener("keydown", onKeyDown, true);
}

/** Install once from the app shell so ⌘A works before any list mounts. */
export function installSelectAllShortcutListeners() {
  ensureWindowListeners();
}

/**
 * ⌘A / Ctrl+A selects all rows when the list owns multi-select.
 * Also listens for the native Edit → Select All menu event (Tauri), which
 * otherwise only selects page text and never reaches JS keydown.
 *
 * Window listeners are installed once for the app lifetime so ⌘A still works
 * in text fields when no list is mounted.
 */
export function useListSelectAllShortcut({
  enabled = true,
  onSelectAll,
}: {
  enabled?: boolean;
  onSelectAll: (() => void | Promise<void>) | null | undefined;
}) {
  useEffect(() => {
    ensureWindowListeners();
  }, []);

  useEffect(() => {
    if (!enabled || !onSelectAll) return;

    selectAllHandlers.push(onSelectAll);
    return () => {
      const index = selectAllHandlers.lastIndexOf(onSelectAll);
      if (index >= 0) selectAllHandlers.splice(index, 1);
    };
  }, [enabled, onSelectAll]);
}
