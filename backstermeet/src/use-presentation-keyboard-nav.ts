import { useEffect, useRef } from "react";
import {
  PRESENTATION_KINDS,
  type PresentationKind,
} from "./presentation";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest("[contenteditable='true']") != null;
}

function moveInList(index: number, delta: number, count: number): number {
  return (index + delta + count) % count;
}

/**
 * Arrow keys select Local / Screenshare in the toolbar. Enter selects the
 * focused kind when none is active. Escape closes presentation.
 */
export function usePresentationKeyboardNav({
  enabled,
  activePresentation,
  pickerFocus,
  onPickerFocusChange,
  onSelect,
  onClose,
}: {
  enabled: boolean;
  activePresentation: PresentationKind | null;
  pickerFocus: number;
  onPickerFocusChange: (index: number) => void;
  onSelect: (kind: PresentationKind) => void;
  onClose: () => void;
}) {
  const pickerFocusRef = useRef(pickerFocus);
  const activeRef = useRef(activePresentation);
  const onPickerFocusChangeRef = useRef(onPickerFocusChange);
  const onSelectRef = useRef(onSelect);
  const onCloseRef = useRef(onClose);
  pickerFocusRef.current = pickerFocus;
  activeRef.current = activePresentation;
  onPickerFocusChangeRef.current = onPickerFocusChange;
  onSelectRef.current = onSelect;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      const kinds = PRESENTATION_KINDS;
      const count = kinds.length;
      const active = activeRef.current;
      const currentIndex = active
        ? kinds.indexOf(active)
        : pickerFocusRef.current;
      if (currentIndex < 0) return;

      const key = event.key;

      if (key === "Enter" || key === " ") {
        if (active) return;
        event.preventDefault();
        onSelectRef.current(kinds[pickerFocusRef.current]!);
        return;
      }

      let nextIndex = currentIndex;
      if (key === "ArrowDown" || key === "ArrowRight") {
        nextIndex = moveInList(currentIndex, 1, count);
      } else if (key === "ArrowUp" || key === "ArrowLeft") {
        nextIndex = moveInList(currentIndex, -1, count);
      } else {
        return;
      }

      event.preventDefault();
      if (nextIndex === currentIndex) return;

      // Arrows always commit a mode (same as clicking a toolbar tab).
      onPickerFocusChangeRef.current(nextIndex);
      onSelectRef.current(kinds[nextIndex]!);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled]);
}
