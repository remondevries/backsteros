export type RightPanelAction = "open-new-menu";

const EVENT_NAME = "t3code:right-panel-action";

/** True when Cmd/Ctrl+T asked for the add-tab menu before the panel mounted. */
let pendingOpenNewMenu = false;

export function requestRightPanelNewMenu(): void {
  pendingOpenNewMenu = true;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RightPanelAction>(EVENT_NAME, { detail: "open-new-menu" }));
}

/** Returns true once if a pending open-new-menu request was waiting. */
export function consumePendingRightPanelNewMenu(): boolean {
  if (!pendingOpenNewMenu) return false;
  pendingOpenNewMenu = false;
  return true;
}

export function subscribeRightPanelAction(listener: (action: RightPanelAction) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<RightPanelAction>).detail;
    if (typeof detail === "string") listener(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
