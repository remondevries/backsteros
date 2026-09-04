import { useIsFocused } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";

import { isGoLeaderSequencePending } from "./go-leader-sequence";
import {
  useKeyEventListener,
  type KeyPressEvent,
  type KeyReleaseEvent,
} from "./key-event";
import {
  isListKeyboardActivateKey,
  listKeyboardNavDirection,
  stepListKeyboardIndex,
} from "./list-keyboard-nav";

function isEditableFocused(): boolean {
  return TextInput.State.currentlyFocusedInput() != null;
}

/**
 * Desktop-parity j/k (+ arrows) list navigation for iPad hardware keyboards.
 * Enter / Space activates the highlighted row.
 *
 * Only the focused route handles keys — inactive tabs stay mounted after first
 * visit (`lazy: true`), so without this gate Enter would activate every live list.
 */
export function useListJkNavigation({
  itemIds,
  enabled = true,
  onActivate,
  onHighlightChange,
}: {
  itemIds: readonly string[];
  enabled?: boolean;
  onActivate: (id: string) => void;
  onHighlightChange?: (id: string | null, index: number) => void;
}): {
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;
} {
  const isFocused = useIsFocused();
  const active = enabled && isFocused;

  const [highlightedId, setHighlightedIdState] = useState<string | null>(null);
  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const onHighlightChangeRef = useRef(onHighlightChange);
  onHighlightChangeRef.current = onHighlightChange;
  const highlightedIdRef = useRef(highlightedId);
  highlightedIdRef.current = highlightedId;
  const activeRef = useRef(active);
  activeRef.current = active;

  const setHighlightedId = useCallback((id: string | null) => {
    setHighlightedIdState(id);
    const index = id ? itemIdsRef.current.indexOf(id) : -1;
    onHighlightChangeRef.current?.(id, index);
  }, []);

  // Drop stale highlight when the visible id list changes or screen blurs.
  useEffect(() => {
    if (!active && highlightedId) {
      setHighlightedIdState(null);
      highlightedIdRef.current = null;
      onHighlightChangeRef.current?.(null, -1);
      return;
    }
    if (highlightedId && !itemIds.includes(highlightedId)) {
      setHighlightedIdState(null);
      onHighlightChangeRef.current?.(null, -1);
    }
  }, [active, highlightedId, itemIds]);

  const onKeyEvent = useCallback((event: KeyPressEvent | KeyReleaseEvent) => {
    if (!activeRef.current) return;
    if (event.eventType !== "press") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.repeat) return;
    if (isEditableFocused()) return;

    const ids = itemIdsRef.current;
    if (ids.length === 0) return;

    const direction = listKeyboardNavDirection(event.key, event.character);
    if (direction) {
      if (
        (event.key === "j" ||
          event.key === "k" ||
          event.key === "KeyJ" ||
          event.key === "KeyK" ||
          event.character === "j" ||
          event.character === "k" ||
          event.character === "J" ||
          event.character === "K") &&
        isGoLeaderSequencePending()
      ) {
        return;
      }
      if (event.shiftKey) return;

      const currentIndex = highlightedIdRef.current
        ? ids.indexOf(highlightedIdRef.current)
        : -1;
      const nextIndex = stepListKeyboardIndex(
        currentIndex,
        direction,
        ids.length,
      );
      if (nextIndex < 0) return;
      const nextId = ids[nextIndex]!;
      setHighlightedIdState(nextId);
      highlightedIdRef.current = nextId;
      onHighlightChangeRef.current?.(nextId, nextIndex);
      return;
    }

    if (event.shiftKey) return;
    if (!isListKeyboardActivateKey(event.key, event.key)) return;
    const id = highlightedIdRef.current;
    if (!id || !ids.includes(id)) return;
    onActivateRef.current(id);
  }, []);

  useKeyEventListener(onKeyEvent, {
    listenOnMount: true,
    captureModifiers: true,
  });

  return { highlightedId: active ? highlightedId : null, setHighlightedId };
}
