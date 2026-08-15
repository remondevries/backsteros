export const TASK_PROPERTY_DROPDOWN_ATTRIBUTE = "data-task-property-dropdown";

/**
 * Present on the task bulk editor when more than one task is selected.
 * Property hotkeys (S/P/A/⇧D/…) open fields here instead of a single row.
 */
export const TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE =
  "data-task-bulk-property-scope";

export type TaskPropertyDropdownId =
  | "status"
  | "priority"
  | "dueDate"
  | "startDate"
  | "assignee"
  | "area"
  | "areaId"
  | "project"
  | "organization"
  | "contact"
  | "receivedDate"
  /** Finance transaction row / detail fields */
  | "category"
  | "account"
  | "merchant";

export type TaskPropertyDropdownShortcutKey =
  | "s"
  | "p"
  | "d"
  | "a"
  | "o"
  | "c"
  | "r"
  | "m";

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
 * Finance transaction property hotkeys (category / account / merchant).
 * Prefer these over task assignee/area when a finance tx list is on screen.
 * Category uses ⇧C so plain C still opens compose.
 */
export function resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): TaskPropertyDropdownId[] {
  if (event.shiftKey) {
    if (matchesShortcutLetter(event, "c", "KeyC")) {
      return ["category"];
    }
    return [];
  }

  if (matchesShortcutLetter(event, "a", "KeyA")) {
    return ["account"];
  }

  if (matchesShortcutLetter(event, "m", "KeyM")) {
    return ["merchant"];
  }

  return [];
}

/** True when any finance tx property hotkey target is mounted. */
export function pageHasFinanceTxPropertyHotkeyTargets(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector(
      [
        `[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}="category"]`,
        `[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}="account"]`,
        `[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}="merchant"]`,
      ].join(", "),
    ) !== null
  );
}

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
    return ["receivedDate"];
  }

  return [];
}

export function resolveTaskPropertyDropdownIdFromEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): TaskPropertyDropdownId | null {
  return resolveTaskPropertyDropdownOpenCandidatesFromEvent(event)[0] ?? null;
}

export function resolveTaskPropertyDropdownId(
  key: string,
  shiftKey: boolean,
): TaskPropertyDropdownId | null {
  return resolveTaskPropertyDropdownIdFromEvent({
    key,
    code: "",
    shiftKey,
  });
}

export function isTaskPropertyDropdownShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): boolean {
  if (
    resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent(event).length > 0
  ) {
    return true;
  }
  return resolveTaskPropertyDropdownOpenCandidatesFromEvent(event).length > 0;
}
