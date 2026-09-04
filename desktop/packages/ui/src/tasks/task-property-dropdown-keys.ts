export const TASK_PROPERTY_DROPDOWN_ATTRIBUTE = "data-task-property-dropdown";

/**
 * Present on the task bulk editor when more than one task is selected.
 * Property hotkeys (S/P/A/⇧D/…) open fields here instead of a single row.
 */
export const TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE =
  "data-task-bulk-property-scope";

/** Floating finance filter bar (Shift+A/C/O/G/R/M). */
export const FINANCE_FILTER_SCOPE_ATTRIBUTE = "data-finance-filter-scope";

/** Floating finance bulk editor when transactions are selected. */
export const FINANCE_BULK_SCOPE_ATTRIBUTE = "data-finance-bulk-property-scope";

export type TaskPropertyDropdownId =
  | "status"
  | "priority"
  | "dueDate"
  | "startDate"
  | "assignee"
  | "related"
  | "area"
  | "areaId"
  | "project"
  | "organization"
  | "contact"
  | "receivedDate"
  /** Finance transaction row / detail / filter / bulk fields */
  | "category"
  | "account"
  | "merchant"
  | "goal"
  | "recurring"
  | "amount";

export type TaskPropertyDropdownShortcutKey =
  | "s"
  | "p"
  | "d"
  | "a"
  | "o"
  | "c"
  | "r"
  | "m"
  | "g";

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
 * Shift+letter opens finance filter chrome, or bulk chrome when a selection is
 * active (bulk scope mounted).
 */
export function resolveFinanceChromeDropdownOpenCandidatesFromEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): TaskPropertyDropdownId[] {
  if (!event.shiftKey) {
    return [];
  }

  if (matchesShortcutLetter(event, "a", "KeyA")) {
    return ["account"];
  }
  if (matchesShortcutLetter(event, "c", "KeyC")) {
    return ["category"];
  }
  if (matchesShortcutLetter(event, "o", "KeyO")) {
    return ["organization"];
  }
  if (matchesShortcutLetter(event, "g", "KeyG")) {
    return ["goal"];
  }
  if (matchesShortcutLetter(event, "r", "KeyR")) {
    return ["recurring"];
  }
  if (matchesShortcutLetter(event, "m", "KeyM")) {
    return ["amount"];
  }

  return [];
}

/**
 * Finance transaction property hotkeys.
 * List (highlighted row): C category, A account, O/M organization, R recurring.
 * Detail open: those plus P project, G goal — and all prefer the right panel.
 */
export function resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): TaskPropertyDropdownId[] {
  if (event.shiftKey) {
    return [];
  }

  if (matchesShortcutLetter(event, "c", "KeyC")) {
    return ["category"];
  }

  if (matchesShortcutLetter(event, "a", "KeyA")) {
    return ["account"];
  }

  if (
    matchesShortcutLetter(event, "o", "KeyO") ||
    matchesShortcutLetter(event, "m", "KeyM")
  ) {
    return ["merchant"];
  }

  if (matchesShortcutLetter(event, "r", "KeyR")) {
    return ["recurring"];
  }

  if (isFinanceTxDetailPanelOpen()) {
    if (matchesShortcutLetter(event, "p", "KeyP")) {
      return ["project"];
    }
    if (matchesShortcutLetter(event, "g", "KeyG")) {
      return ["goal"];
    }
  }

  return [];
}

/** Right-hand transaction detail pane is open (not the empty placeholder). */
export function isFinanceTxDetailPanelOpen(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector(".finance-transactions-view__detail") !== null
  );
}

/** True when finance filter or bulk chrome scopes are mounted. */
export function pageHasFinanceChromeHotkeyTargets(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector(
      `[${FINANCE_FILTER_SCOPE_ATTRIBUTE}], [${FINANCE_BULK_SCOPE_ATTRIBUTE}]`,
    ) !== null
  );
}

/**
 * Plain C should open category (and block compose) while a transaction row is
 * highlighted or the transaction detail panel is open.
 */
export function shouldYieldComposeToFinanceTxCategory(): boolean {
  if (typeof document === "undefined") return false;

  if (isFinanceTxDetailPanelOpen()) {
    return true;
  }

  const zone = document.body.getAttribute("data-keyboard-nav-active-zone");
  if (zone !== "main" && zone !== "content") {
    return false;
  }

  const highlighted = document.querySelector(".keyboard-nav-item-highlight");
  if (!(highlighted instanceof HTMLElement)) {
    return false;
  }

  const row =
    highlighted.closest(`[data-keyboard-nav-item]`) ?? highlighted;
  return (
    row.querySelector(`[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}="category"]`) !==
    null
  );
}

/**
 * Plain G opens the Go navigation palette — except while a finance transaction
 * detail panel is open, where G owns the goal dropdown (compose/C parity).
 */
export function shouldYieldGoNavigationToFinanceTxGoal(): boolean {
  return isFinanceTxDetailPanelOpen();
}

/** @deprecated Prefer {@link shouldYieldComposeToFinanceTxCategory}. */
export function pageHasFinanceTxPropertyHotkeyTargets(): boolean {
  return shouldYieldComposeToFinanceTxCategory();
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

  // Tasks: Related contacts. Letters: Received date (whichever trigger exists).
  if (matchesShortcutLetter(event, "r", "KeyR")) {
    return ["related", "receivedDate"];
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
    resolveFinanceChromeDropdownOpenCandidatesFromEvent(event).length > 0
  ) {
    return true;
  }
  if (
    resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent(event).length > 0
  ) {
    return true;
  }
  return resolveTaskPropertyDropdownOpenCandidatesFromEvent(event).length > 0;
}
