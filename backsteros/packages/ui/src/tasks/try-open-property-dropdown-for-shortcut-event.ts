import {
  openFinanceChromeDropdown,
  openFinanceTxPropertyDropdown,
  openTaskPropertyDropdown,
} from "./open-task-property-dropdown.js";
import {
  pageHasFinanceChromeHotkeyTargets,
  resolveFinanceChromeDropdownOpenCandidatesFromEvent,
  resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent,
  resolveTaskPropertyDropdownOpenCandidatesFromEvent,
  shouldYieldComposeToFinanceTxCategory,
} from "./task-property-dropdown-keys.js";

/**
 * Open the property dropdown that a shortcut event would open (finance chrome,
 * finance tx fields, then task/project fields). Used by the live key handler
 * and by the deferred single-A path after a personal-assistant double-tap wait.
 */
export function tryOpenPropertyDropdownForShortcutEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
): boolean {
  if (pageHasFinanceChromeHotkeyTargets()) {
    const chromeIds =
      resolveFinanceChromeDropdownOpenCandidatesFromEvent(event);
    if (chromeIds.length > 0 && openFinanceChromeDropdown(chromeIds)) {
      return true;
    }
  }

  const financeIds =
    resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent(event);
  const financeCandidates =
    shouldYieldComposeToFinanceTxCategory() ||
    !financeIds.includes("category")
      ? financeIds
      : financeIds.filter((id) => id !== "category");

  if (
    financeCandidates.length > 0 &&
    openFinanceTxPropertyDropdown(financeCandidates)
  ) {
    return true;
  }

  const dropdownIds =
    resolveTaskPropertyDropdownOpenCandidatesFromEvent(event);
  if (dropdownIds.length === 0) {
    return false;
  }

  return openTaskPropertyDropdown(dropdownIds);
}

/** Synthetic plain-A event for the deferred assignee / area open. */
export function plainAShortcutEvent(): Pick<
  KeyboardEvent,
  "key" | "code" | "shiftKey"
> {
  return { key: "a", code: "KeyA", shiftKey: false };
}
