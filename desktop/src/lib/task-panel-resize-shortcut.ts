/**
 * ⌥- shrinks the left panel; ⌥= shrinks the right panel.
 * Used on task detail and codebase project overview.
 * Match by `code` — with Option held, `key` is often a special character.
 */
export type PanelResizeDirection = "shrink-left" | "shrink-right";

/** @deprecated Prefer PanelResizeDirection */
export type TaskPanelResizeDirection = PanelResizeDirection;

export function resolvePanelResizeShortcut(
  event: Pick<KeyboardEvent, "altKey" | "metaKey" | "ctrlKey" | "code">,
): PanelResizeDirection | null {
  if (!event.altKey || event.metaKey || event.ctrlKey) {
    return null;
  }

  if (event.code === "Minus" || event.code === "NumpadSubtract") {
    return "shrink-left";
  }

  if (event.code === "Equal" || event.code === "NumpadAdd") {
    return "shrink-right";
  }

  return null;
}

/** @deprecated Prefer resolvePanelResizeShortcut */
export const resolveTaskPanelResizeShortcut = resolvePanelResizeShortcut;
