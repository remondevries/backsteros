export function isHorizontalArrowKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  return (
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.code === "ArrowLeft" ||
    event.code === "ArrowRight"
  );
}

/** Compose modal task/document toggle (cmd+shift+arrows). */
export function hasCmdShiftArrowShortcutModifiers(event: KeyboardEvent): boolean {
  const primary = event.metaKey || event.ctrlKey;
  return primary && event.shiftKey && !event.altKey;
}

export type HorizontalArrowDirection = "left" | "right";

export function getHorizontalArrowDirection(
  key: string,
  code: string,
): HorizontalArrowDirection | null {
  if (key === "ArrowLeft" || code === "ArrowLeft") {
    return "left";
  }

  if (key === "ArrowRight" || code === "ArrowRight") {
    return "right";
  }

  return null;
}
