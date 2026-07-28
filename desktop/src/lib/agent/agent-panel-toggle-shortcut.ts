/**
 * Plain ] toggles the right agent content panel (chat / terminal / surfaces)
 * on task screens. Left content list uses ⇧[ instead.
 */
export function isAgentPanelToggleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key === "]" || event.code === "BracketRight";
}
