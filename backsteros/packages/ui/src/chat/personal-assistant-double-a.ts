/**
 * Plain A → A (fast double-tap) toggles the personal-assistant chat column.
 * A single A is deferred briefly so assignee / area hotkeys still work.
 */

export const PERSONAL_ASSISTANT_DOUBLE_A_MS = 300;

type Handler = () => void;

let singleAHandler: Handler | null = null;
let doubleAHandler: Handler | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pending = false;

export function setPersonalAssistantSingleAHandler(
  handler: Handler | null,
): void {
  singleAHandler = handler;
}

export function setPersonalAssistantDoubleAHandler(
  handler: Handler | null,
): void {
  doubleAHandler = handler;
}

export function isPersonalAssistantDoubleAPending(): boolean {
  return pending;
}

export function clearPersonalAssistantDoubleA(): void {
  if (pendingTimer != null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pending = false;
}

export function isPersonalAssistantDoubleAKey(event: {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  if (event.key.length === 1 && event.key.toLowerCase() === "a") {
    return true;
  }
  return event.code === "KeyA";
}

/**
 * Consume a plain A for double-tap chat vs deferred single-A (assignee).
 * Returns true when the event should be prevented (armed or completed).
 */
export function consumePersonalAssistantDoubleA(event: {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}): boolean {
  if (!isPersonalAssistantDoubleAKey(event)) return false;
  if (event.repeat) return false;

  if (pending) {
    clearPersonalAssistantDoubleA();
    doubleAHandler?.();
    return true;
  }

  pending = true;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    pending = false;
    singleAHandler?.();
  }, PERSONAL_ASSISTANT_DOUBLE_A_MS);
  return true;
}
