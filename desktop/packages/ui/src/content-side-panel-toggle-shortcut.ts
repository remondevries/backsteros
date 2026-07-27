export function isContentSidePanelToggleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  // Circle: ⇧[ toggles the content list panel.
  if (event.shiftKey && event.code === "BracketLeft") {
    return true;
  }

  // Plain ] mirrors [ for the left app sidebar — collapses/expands the
  // content list panel.
  if (
    !event.shiftKey &&
    (event.key === "]" || event.code === "BracketRight")
  ) {
    return true;
  }

  return false;
}
