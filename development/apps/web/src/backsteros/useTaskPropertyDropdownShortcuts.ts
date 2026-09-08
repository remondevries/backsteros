import { useEffect, useRef } from "react";

import { openTaskPropertyDropdown } from "./openTaskPropertyDropdown";
import { shouldHandleTaskPropertyDropdownShortcut } from "./taskPropertyDropdownShortcut";
import { resolveTaskPropertyDropdownOpenCandidatesFromEvent } from "./taskPropertyDropdownKeys";

/**
 * S / P / A / R and Shift+D / Shift+P open task property menus — same chords as
 * BacksterOS desktop (`useTaskPropertyDropdownShortcuts`).
 *
 * Fires whenever a task detail is open, except while description Edit mode is
 * active or the message chatbox (or an open property/title field) owns focus.
 */
export function useTaskPropertyDropdownShortcuts({
  enabled = true,
}: {
  enabled?: boolean;
} = {}): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!enabledRef.current) return;
      if (!shouldHandleTaskPropertyDropdownShortcut(event)) return;

      const dropdownIds = resolveTaskPropertyDropdownOpenCandidatesFromEvent(event);
      if (dropdownIds.length === 0) return;
      if (!openTaskPropertyDropdown(dropdownIds)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
