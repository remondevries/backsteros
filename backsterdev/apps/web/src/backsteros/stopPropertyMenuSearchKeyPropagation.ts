import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Keep property-menu search keystrokes in the input.
 * Base UI menu typeahead otherwise eats letters (and our S/P/A hotkeys would
 * too if they bubble to the window capture listener).
 * Escape is left alone so the menu can still dismiss.
 */
export function stopPropertyMenuSearchKeyPropagation(
  event: ReactKeyboardEvent<HTMLInputElement>,
): void {
  if (event.key === "Escape") return;
  event.stopPropagation();
}
