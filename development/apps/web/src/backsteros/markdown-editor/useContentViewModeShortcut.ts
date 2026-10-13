import { useEffect, useRef, type RefObject } from "react";

import {
  registerContentViewModeToggle,
  registerForceContentPreview,
} from "./contentViewModeShortcut";

export {
  isForceContentPreviewShortcut,
  isToggleContentViewModeShortcut,
  registerContentViewModeToggle,
  registerForceContentPreview,
} from "./contentViewModeShortcut";

/**
 * ⌘E toggles edit ↔ preview; ⌘P forces preview — same chords as BacksterOS
 * desktop (`useContentViewModeShortcut`).
 *
 * Pass `hostRef` at the visible detail root so hidden/inert panes cannot steal
 * the shortcut.
 */
export function useContentViewModeShortcut({
  enabled = true,
  onToggle,
  onForcePreview,
  hostRef,
}: {
  enabled?: boolean;
  onToggle: () => void;
  onForcePreview?: () => void;
  hostRef?: RefObject<Element | null>;
}) {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onForcePreviewRef = useRef(onForcePreview);
  onForcePreviewRef.current = onForcePreview;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const hostRefInternal = useRef<Element | null>(null);
  const resolvedHostRef = hostRef ?? hostRefInternal;

  useEffect(() => {
    return registerContentViewModeToggle({
      toggle: () => {
        onToggleRef.current();
      },
      isEnabled: () => enabledRef.current,
      getHost: () => resolvedHostRef.current,
    });
  }, [resolvedHostRef]);

  useEffect(() => {
    return registerForceContentPreview({
      forcePreview: () => {
        onForcePreviewRef.current?.();
      },
      isEnabled: () => enabledRef.current && typeof onForcePreviewRef.current === "function",
      getHost: () => resolvedHostRef.current,
    });
  }, [resolvedHostRef]);

  return resolvedHostRef;
}
