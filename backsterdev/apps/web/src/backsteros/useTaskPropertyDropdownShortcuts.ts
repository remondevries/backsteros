import { useEffect, useRef } from "react";

import { openTaskPropertyDropdown } from "./openTaskPropertyDropdown";
import { shouldHandleTaskPropertyDropdownShortcut } from "./taskPropertyDropdownShortcut";
import { resolveTaskPropertyDropdownOpenCandidatesFromEvent } from "./taskPropertyDropdownKeys";

/**
 * S / P / A / R and Shift+D / Shift+P open property menus — same chords as
 * BacksterOS desktop (`useTaskPropertyDropdownShortcuts`).
 *
 * While the create-task compose modal is open, {@link openTaskPropertyDropdown}
 * routes exclusively to that dialog's chips; when it closes, the same chords
 * bind back to the open task detail (if any).
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
