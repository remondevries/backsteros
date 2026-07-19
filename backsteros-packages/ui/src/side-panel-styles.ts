type SidePanelItemOptions = {
  active?: boolean;
  /** Keyboard navigation highlight (distinct from route-active). */
  keyboardHighlighted?: boolean;
  /** Multi-line rows (e.g. inbox tasks). */
  stacked?: boolean;
};

export function sidePanelItemClass(
  activeOrOptions: boolean | SidePanelItemOptions = false,
) {
  const options =
    typeof activeOrOptions === "boolean"
      ? { active: activeOrOptions }
      : activeOrOptions;

  const classes = ["app-side-panel-item"];
  if (options.active) {
    classes.push("app-side-panel-item-active");
  }
  if (options.keyboardHighlighted) {
    classes.push("keyboard-nav-item-highlight");
  }
  if (options.stacked) {
    classes.push("app-side-panel-item-stacked");
  }
  return classes.join(" ");
}
