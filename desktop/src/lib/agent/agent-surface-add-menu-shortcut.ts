/**
 * ⌥T opens the agent surface “+” add menu when surface tabs are already open.
 * Match by `code`: with Option held, `event.key` is often a special character.
 */
export function isAgentSurfaceAddMenuShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code"
  >,
): boolean {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
    return false;
  }
  return event.code === "KeyT";
}

export type AgentSurfaceAddMenuNavAction =
  | "next"
  | "previous"
  | "confirm"
  | "dismiss";

/** Arrow / j/k / Enter / Escape while the add-surface menu is open. */
export function resolveAgentSurfaceAddMenuNavAction(
  event: Pick<KeyboardEvent, "key" | "code" | "altKey" | "metaKey" | "ctrlKey">,
): AgentSurfaceAddMenuNavAction | null {
  if (event.altKey || event.metaKey || event.ctrlKey) {
    return null;
  }

  if (event.key === "Escape") return "dismiss";
  if (event.key === "Enter" || event.key === " ") return "confirm";

  if (
    event.key === "ArrowDown" ||
    event.key === "j" ||
    event.key === "J" ||
    event.code === "KeyJ"
  ) {
    return "next";
  }

  if (
    event.key === "ArrowUp" ||
    event.key === "k" ||
    event.key === "K" ||
    event.code === "KeyK"
  ) {
    return "previous";
  }

  return null;
}

/** Next/previous enabled index in a circular list. Returns -1 when none. */
export function moveEnabledMenuIndex(
  enabledFlags: readonly boolean[],
  currentIndex: number,
  direction: "next" | "previous",
): number {
  const enabledIndexes = enabledFlags
    .map((enabled, index) => (enabled ? index : -1))
    .filter((index) => index >= 0);
  if (enabledIndexes.length === 0) return -1;

  const currentPos = enabledIndexes.indexOf(currentIndex);
  if (direction === "next") {
    if (currentPos < 0) return enabledIndexes[0]!;
    return enabledIndexes[(currentPos + 1) % enabledIndexes.length]!;
  }

  if (currentPos < 0) return enabledIndexes[enabledIndexes.length - 1]!;
  return enabledIndexes[
    (currentPos - 1 + enabledIndexes.length) % enabledIndexes.length
  ]!;
}

export function firstEnabledMenuIndex(
  enabledFlags: readonly boolean[],
): number {
  return enabledFlags.findIndex((enabled) => enabled);
}
