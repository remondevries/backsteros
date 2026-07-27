"use client";

import { useEffect } from "react";

import { shouldBlockPageShortcuts, shouldHandleGlobalShortcut } from "./shortcut-guards.js";
import { useLatestRef } from "./use-latest-ref.js";

export const LETTER_PDF_ZOOM_IN_SHORTCUT_HINT = "⌥+";
export const LETTER_PDF_ZOOM_OUT_SHORTCUT_HINT = "⌥-";

export type LetterPdfZoomDirection = "in" | "out";

export function resolveLetterPdfZoomShortcut(
  event: Pick<KeyboardEvent, "altKey" | "metaKey" | "ctrlKey" | "code">,
): LetterPdfZoomDirection | null {
  if (!event.altKey || event.metaKey || event.ctrlKey) {
    return null;
  }

  // Match by code: with Option held, event.key is often a special character.
  if (event.code === "Equal" || event.code === "NumpadAdd") {
    return "in";
  }

  if (event.code === "Minus" || event.code === "NumpadSubtract") {
    return "out";
  }

  return null;
}

export function useLetterPdfZoomShortcut({
  onZoomIn,
  onZoomOut,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
}): void {
  const onZoomInRef = useLatestRef(onZoomIn);
  const onZoomOutRef = useLatestRef(onZoomOut);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const direction = resolveLetterPdfZoomShortcut(event);
      if (direction == null) {
        return;
      }

      if (shouldBlockPageShortcuts()) {
        return;
      }

      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (direction === "in") {
        onZoomInRef.current();
      } else {
        onZoomOutRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onZoomInRef, onZoomOutRef]);
}
