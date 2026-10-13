"use client";

import { useEffect, useRef, type RefObject } from "react";

import {
  installContentViewModeShortcutListeners,
  registerContentViewModeToggle,
  registerForceContentPreview,
} from "./content-view-mode-shortcut.js";

export {
  FORCE_CONTENT_PREVIEW_EVENT,
  TOGGLE_CONTENT_VIEW_MODE_EVENT,
  installContentViewModeShortcutListeners,
  isForceContentPreviewShortcut,
  isToggleContentViewModeShortcut,
  registerContentViewModeToggle,
  registerForceContentPreview,
} from "./content-view-mode-shortcut.js";

/**
 * ⌘E toggles edit ↔ preview; ⌘P forces preview.
 * Also listens for Tauri Edit menu accelerators — WKWebView swallows ⌘E
 * ("Use Selection for Find") and ⌘P (Print) while a text field / CodeMirror
 * is focused unless the app menu claims them.
 *
 * Pass `hostRef` pointing at the visible detail root so keep-alive-hidden
 * panes cannot steal the shortcut from the active section (e.g. letters).
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
    installContentViewModeShortcutListeners();
  }, []);

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
      isEnabled: () =>
        enabledRef.current && typeof onForcePreviewRef.current === "function",
      getHost: () => resolvedHostRef.current,
    });
  }, [resolvedHostRef]);

  return resolvedHostRef;
}
