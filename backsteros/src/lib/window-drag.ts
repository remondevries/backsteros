import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauriRuntime } from "./tauri-runtime";

/**
 * Start a window drag from the product chrome.
 * Must invoke synchronously on mousedown (dynamic import loses the gesture).
 * Requires `core:window:allow-start-dragging` in capabilities.
 * Same pattern as BacksterDESIGN desktop chrome.
 */
export function startWindowDrag(event: { button: number }): void {
  if (event.button !== 0 || !isTauriRuntime()) return;
  void getCurrentWindow()
    .startDragging()
    .catch((err: unknown) => {
      console.error("[chrome] startDragging failed", err);
    });
}

/** True when mousedown landed on empty chrome (not interactive controls). */
export function isChromeDragEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-tauri-drag-region="false"]')) return false;
  if (
    target.closest(
      "button, a, input, textarea, select, [role='tab'], [role='menuitem'], [contenteditable='true']",
    )
  ) {
    return false;
  }
  const region = target.closest("[data-tauri-drag-region]");
  if (!region) return false;
  return region.getAttribute("data-tauri-drag-region") !== "false";
}

/**
 * Wire empty titlebar / tab chrome to native window drag (macOS overlay titlebar).
 */
export function useWindowChromeDrag(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    function onMouseDown(event: MouseEvent) {
      if (!isChromeDragEventTarget(event.target)) return;
      startWindowDrag(event);
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);
}
