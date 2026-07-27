/**
 * When the files tree owns keyboard focus, tree shortcuts take over
 * (C / ⇧C create, D delete) instead of compose / open-file delete.
 */
let fsTreeKeyboardActive = false;

export function setFsTreeKeyboardActive(value: boolean): void {
  fsTreeKeyboardActive = value;
}

export function isFsTreeKeyboardActive(): boolean {
  return fsTreeKeyboardActive;
}

export function isFsTreeCreateShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  return (
    (event.key.length === 1 && event.key.toLowerCase() === "c") ||
    event.code === "KeyC"
  );
}
