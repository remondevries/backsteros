export function isContentSidePanelToggleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  // ⇧[ toggles the left content list panel. Plain ] is reserved for the
  // right agent/content panel (see isAgentPanelToggleShortcut).
  return event.shiftKey && event.code === "BracketLeft";
}
