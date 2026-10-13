import type { SyntheticEvent } from "react";

/** Prevent list-row keyboard navigation from handling field control events. */
export function stopFieldEvent(event: SyntheticEvent) {
  event.stopPropagation();
}
