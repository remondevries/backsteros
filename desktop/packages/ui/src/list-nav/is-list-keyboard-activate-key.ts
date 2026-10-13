export function isListKeyboardActivateKey(
  event: Pick<KeyboardEvent, "key" | "code" | "repeat">,
): boolean {
  if (event.repeat) {
    return false;
  }

  return (
    event.key === "Enter" ||
    event.key === " " ||
    event.key === "Spacebar" ||
    event.code === "Space"
  );
}
