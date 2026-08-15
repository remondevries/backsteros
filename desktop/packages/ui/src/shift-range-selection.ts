import { useEffect, useRef } from "react";

/**
 * Tracks whether a modifier key is currently held. Useful in WKWebView/Tauri
 * where `event.shiftKey` on click can be dropped after a text-selection gesture.
 */
export function useKeyHeld(key: string): { currentlyHeld: () => boolean } {
  const heldRef = useRef(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === key) heldRef.current = true;
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === key) heldRef.current = false;
    }
    function onBlur() {
      heldRef.current = false;
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [key]);

  return {
    currentlyHeld: () => heldRef.current,
  };
}

/**
 * Toggle or range-select ids. When `shiftKey` is set and an anchor exists,
 * selects every id between the anchor and `id` in `orderedIds` (inclusive).
 */
export function applyShiftRangeSelection(
  prev: ReadonlySet<string>,
  id: string,
  options: {
    shiftKey: boolean;
    orderedIds: readonly string[];
    lastClickedId: string | null;
  },
): { next: Set<string>; lastClickedId: string } {
  const next = new Set(prev);
  const { shiftKey, orderedIds, lastClickedId } = options;
  if (shiftKey && lastClickedId) {
    const start = orderedIds.indexOf(lastClickedId);
    const end = orderedIds.indexOf(id);
    if (start >= 0 && end >= 0) {
      const [from, to] = start < end ? [start, end] : [end, start];
      for (let i = from; i <= to; i += 1) next.add(orderedIds[i]!);
      return { next, lastClickedId: id };
    }
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { next, lastClickedId: id };
}
