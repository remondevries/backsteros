export const TASK_PROPERTY_DROPDOWN_ATTRIBUTE = "data-task-property-dropdown";

export type TaskPropertyDropdownId =
  | "status"
  | "priority"
  | "dueDate"
  | "startDate"
  | "assignee"
  | "related"
  | "area"
  | "project"
  | "organization"
  | "contact"
  | "receivedDate";

function matchesShortcutLetter(
  event: Pick<KeyboardEvent, "key" | "code">,
  letter: string,
  code: string,
): boolean {
  if (event.key.length === 1 && event.key.toLowerCase() === letter) {
    return true;
  }
  return event.code === code;
}

/**
 * Same letter map as BacksterOS desktop `resolveTaskPropertyDropdownOpenCandidatesFromEvent`.
 * Candidates are tried in order until a matching trigger exists in the DOM.
 */
export function resolveTaskPropertyDropdownOpenCandidatesFromEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): TaskPropertyDropdownId[] {
  if (event.shiftKey) {
    if (matchesShortcutLetter(event, "p", "KeyP")) {
      return ["project"];
    }
    if (matchesShortcutLetter(event, "s", "KeyS")) {
      return ["startDate"];
    }
    if (matchesShortcutLetter(event, "c", "KeyC")) {
      return ["contact"];
    }
    if (matchesShortcutLetter(event, "d", "KeyD")) {
      return ["dueDate"];
    }
    return [];
  }

  if (matchesShortcutLetter(event, "s", "KeyS")) {
    return ["status"];
  }
  if (matchesShortcutLetter(event, "p", "KeyP")) {
    return ["priority", "project"];
  }
  if (matchesShortcutLetter(event, "a", "KeyA")) {
    return ["assignee", "area"];
  }
  if (matchesShortcutLetter(event, "o", "KeyO")) {
    return ["organization"];
  }
  if (matchesShortcutLetter(event, "r", "KeyR")) {
    return ["related", "receivedDate"];
  }

  return [];
}

export function isTaskPropertyDropdownShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): boolean {
  return resolveTaskPropertyDropdownOpenCandidatesFromEvent(event).length > 0;
}
