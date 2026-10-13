import { useLayoutEffect, useRef, useState } from "react";

import { usePanelAnimationSettings } from "~/panelAnimations";

/** Desktop task-layout content fade (~160ms). Used when panel animations are off. */
export const BACKSTEROS_CONTENT_CROSSFADE_FALLBACK_MS = 160;

export type ContentCrossfadeState = {
  /** Key whose content should be rendered (lags the live key during fade-out). */
  readonly displayedKey: string;
  /** True while opacity is driven toward 0 (outgoing) or waiting to swap. */
  readonly faded: boolean;
  readonly durationMs: number;
  readonly animated: boolean;
};

/**
 * Opacity crossfade when `contentKey` changes: fade out → swap → fade in.
 * Matches BacksterOS desktop contact/task detail switch behavior.
 *
 * Always animates (including under prefers-reduced-motion). Uses the user's
 * panel animation duration when that setting is on; otherwise a short fallback.
 */
export function useContentCrossfade(contentKey: string): ContentCrossfadeState {
  const panel = usePanelAnimationSettings();
  const durationMs = panel.active ? panel.durationMs : BACKSTEROS_CONTENT_CROSSFADE_FALLBACK_MS;

  const [displayedKey, setDisplayedKey] = useState(contentKey);
  const [faded, setFaded] = useState(false);
  const tokenRef = useRef(0);

  useLayoutEffect(() => {
    if (contentKey === displayedKey) return;

    if (durationMs <= 0) {
      tokenRef.current += 1;
      setDisplayedKey(contentKey);
      setFaded(false);
      return;
    }

    const token = ++tokenRef.current;
    setFaded(true);
    const timer = window.setTimeout(() => {
      if (tokenRef.current !== token) return;
      setDisplayedKey(contentKey);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (tokenRef.current !== token) return;
          setFaded(false);
        });
      });
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [contentKey, displayedKey, durationMs]);

  return { displayedKey, faded, durationMs, animated: true };
}

export function contentCrossfadeStyle(state: ContentCrossfadeState): {
  opacity: number;
  transition: string | undefined;
} {
  return {
    opacity: state.faded ? 0 : 1,
    transition: state.durationMs > 0 ? `opacity ${state.durationMs}ms ease` : undefined,
  };
}
