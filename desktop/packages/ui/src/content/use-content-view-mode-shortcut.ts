"use client";

import { useEffect, useRef } from "react";

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
 */
export function useContentViewModeShortcut({
  enabled = true,
  onToggle,
  onForcePreview,
}: {
  enabled?: boolean;
  onToggle: () => void;
  onForcePreview?: () => void;
}) {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onForcePreviewRef = useRef(onForcePreview);
  onForcePreviewRef.current = onForcePreview;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    installContentViewModeShortcutListeners();
  }, []);

  useEffect(() => {
    return registerContentViewModeToggle({
      toggle: () => {
        onToggleRef.current();
      },
      isEnabled: () => enabledRef.current,
    });
  }, []);

  useEffect(() => {
    return registerForceContentPreview({
      forcePreview: () => {
        onForcePreviewRef.current?.();
      },
      isEnabled: () =>
        enabledRef.current && typeof onForcePreviewRef.current === "function",
    });
  }, []);
}
