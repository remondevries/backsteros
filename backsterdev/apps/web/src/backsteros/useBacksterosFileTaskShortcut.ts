import { useEffect } from "react";

import { isCommandPaletteOpen } from "~/commandPaletteBus";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { isModelPickerOpen } from "~/modelPickerVisibility";

import { isBacksterosGoLeaderPending } from "./backsterosRailMode";
import { isBacksterosFileTaskModalOpen } from "./fileTaskUiStore";
import { shouldYieldPlainKeyHotkey } from "./plainKeyShortcutGuard";
import { isCommentComposerFocusShortcut } from "./TaskCommentsSection";

/** Visible task-detail comment composer owns Shift+C when present. */
export function hasVisibleTaskCommentComposer(
  doc: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (doc == null) return false;
  const composer = doc.querySelector<HTMLElement>('[data-task-comment-focus="composer"]');
  return composer != null && composer.getClientRects().length > 0;
}

/**
 * Shift+C opens the file-as-task modal (orb).
 * Yields to typing surfaces, palettes, terminals, and an open task comment composer.
 */
export function useBacksterosFileTaskShortcut(options: {
  readonly enabled: boolean;
  readonly onOpen: () => void;
}) {
  const { enabled, onOpen } = options;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!isCommentComposerFocusShortcut(event)) return;
      if (isCommandPaletteOpen() || isModelPickerOpen() || isTerminalFocused()) return;
      if (isBacksterosGoLeaderPending()) return;
      if (shouldYieldPlainKeyHotkey(event)) return;
      if (hasVisibleTaskCommentComposer()) return;
      if (isBacksterosFileTaskModalOpen()) return;

      event.preventDefault();
      event.stopPropagation();
      onOpen();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onOpen]);
}
