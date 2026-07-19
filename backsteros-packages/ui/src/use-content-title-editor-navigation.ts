"use client";

import { useCallback, useState } from "react";

import type { MarkdownDetailEditorMode } from "./components/content-markdown-view-layout.js";
import { useTitleRenameShortcut } from "./title-rename-shortcut.js";

type UseContentTitleEditorNavigationOptions = {
  mode: MarkdownDetailEditorMode;
  activateEditMode: (options?: { focusEditor?: boolean }) => void;
  requestEditorFocus: () => void;
  /** When set, focuses the title directly (e.g. compose views with a ref-backed input). */
  focusTitle?: () => void;
};

export function deferFocusAfterTitleLeave(
  requestEditorFocus: () => void,
): void {
  requestAnimationFrame(() => {
    requestEditorFocus();
  });
}

/**
 * Shared title ↔ editor focus flow for detail views (documents, tasks, letters).
 * Wires ⌘R rename, Enter/Tab from title → editor, and Shift+Tab from editor → title.
 */
export function useContentTitleEditorNavigation({
  mode,
  activateEditMode,
  requestEditorFocus,
  focusTitle,
}: UseContentTitleEditorNavigationOptions) {
  const [titleRenameFocusRequest, setTitleRenameFocusRequest] = useState(0);

  const requestTitleFocus = useCallback(() => {
    if (focusTitle) {
      focusTitle();
      return;
    }
    setTitleRenameFocusRequest((count) => count + 1);
  }, [focusTitle]);

  const handleLeaveTitleForEditor = useCallback(() => {
    if (mode === "preview") {
      activateEditMode({ focusEditor: false });
    }
    deferFocusAfterTitleLeave(requestEditorFocus);
  }, [activateEditMode, mode, requestEditorFocus]);

  // Focus the title in the current view mode — do not switch to edit first.
  // Switching remounts dual preview/edit title headers and steals focus into
  // the body editor ("redirect to content").
  useTitleRenameShortcut(requestTitleFocus);

  return {
    titleRenameFocusRequest,
    requestTitleFocus,
    handleLeaveTitleForEditor,
  };
}
