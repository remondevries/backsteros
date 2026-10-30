/**
 * Plain ] toggles the global right chat column (shell-level).
 * Page-level agent rails that also listen for ] use capture and win when
 * present; elsewhere the shell owns the chord.
 *
 * ⇧[ remains the left content list panel (see isContentSidePanelToggleShortcut).
 */
export function isChatPanelToggleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key === "]" || event.code === "BracketRight";
}
