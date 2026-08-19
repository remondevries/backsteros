import { useCallback, useRef, useState } from "react";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  TextInput,
} from "react-native";

/** Overscroll distance (pts) before the search field locks open. */
const REVEAL_THRESHOLD = 64;
/** Treat the list as “settled” once offset is at/near the top (not deep overscroll). */
const SETTLE_EPSILON = 8;

type Options = {
  /** Called once when search first opens (e.g. soft sync retry). */
  onReveal?: () => void;
  /**
   * When true, ignore pull-to-reveal (e.g. while RefreshControl is spinning
   * from a user pull — rubber-band offsets would otherwise open search).
   */
  suppress?: boolean;
};

/**
 * Pull-down on a list reveals an inline search field under the screen header
 * (title / area tabs stay above; search sits above the list rows).
 *
 * Ignores overscroll until the list has settled at least once so remounts,
 * focus returns, and RefreshControl bounces cannot open search by accident.
 * Reveal only commits on drag end (not mid-bounce `onScroll`).
 */
export function usePullToRevealSearch(options: Options = {}) {
  const { onReveal, suppress = false } = options;
  const [revealed, setRevealed] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const revealedRef = useRef(false);
  const settledRef = useRef(false);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const suppressRef = useRef(suppress);
  suppressRef.current = suppress;

  const open = useCallback(() => {
    if (revealedRef.current) return;
    if (suppressRef.current) return;
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

  const noteScrollOffset = useCallback((y: number) => {
    if (revealedRef.current) return;
    // Wait until the list has been at rest near the top before arming reveal.
    // Spurious negative offsets on mount / navigation pop must not open search.
    if (!settledRef.current) {
      if (y >= -SETTLE_EPSILON) settledRef.current = true;
    }
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      noteScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [noteScrollOffset],
  );

  const onScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      noteScrollOffset(y);
      if (revealedRef.current || suppressRef.current) return;
      if (!settledRef.current) return;
      if (y < -REVEAL_THRESHOLD) open();
    },
    [noteScrollOffset, open],
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
