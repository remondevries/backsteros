import { useCallback, useRef, useState } from "react";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  TextInput,
} from "react-native";

/** Overscroll distance (pts) before the search field locks open. */
const REVEAL_THRESHOLD = 52;

type Options = {
  /** Called once when search first opens (e.g. soft sync retry). */
  onReveal?: () => void;
};

/**
 * Pull-down on a list reveals an inline search field under the screen header
 * (title / area tabs stay above; search sits above the list rows).
 */
export function usePullToRevealSearch(options: Options = {}) {
  const { onReveal } = options;
  const [revealed, setRevealed] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const revealedRef = useRef(false);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  const open = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    onRevealRef.current?.();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const closeIfEmpty = useCallback(() => {
    if (query.trim()) return;
    revealedRef.current = false;
    setRevealed(false);
  }, [query]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (revealedRef.current) return;
      if (event.nativeEvent.contentOffset.y < -REVEAL_THRESHOLD) {
        open();
      }
    },
    [open],
  );

  const onScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (revealedRef.current) return;
      if (event.nativeEvent.contentOffset.y < -REVEAL_THRESHOLD / 2) {
        open();
      }
    },
    [open],
  );

  const visible = revealed || query.trim().length > 0;

  return {
    query,
    setQuery,
    visible,
    inputRef,
    open,
    closeIfEmpty,
    onScroll,
    onScrollEndDrag,
  };
}
