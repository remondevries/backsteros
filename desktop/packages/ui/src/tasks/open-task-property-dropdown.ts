import { requestCloseSearchableDropdowns } from "../dropdowns/searchable-dropdown-events.js";
import { markSearchableDropdownOpenPlacement } from "../dropdowns/searchable-dropdown-open-placement.js";
import { resolveComposeModalPropertyScope } from "../compose/compose-modal-shortcut-target.js";
import { KEYBOARD_NAV_ITEM_ATTR } from "../list-nav/keyboard-nav-item.js";
import { resolveTaskListPropertyScope } from "./resolve-task-list-property-scope.js";
import {
  FINANCE_BULK_SCOPE_ATTRIBUTE,
  FINANCE_FILTER_SCOPE_ATTRIBUTE,
  TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE,
  TASK_PROPERTY_DROPDOWN_ATTRIBUTE,
  type TaskPropertyDropdownId,
} from "./task-property-dropdown-keys.js";

/** Open task / inbox detail surfaces (desktop main-slot + agent console). */
const TASK_DETAIL_PROPERTY_SCOPE_SELECTORS = [
  ".main-slot",
  ".console-content-inbox-detail",
  ".task-panel-island--detail",
  ".task-detail-view",
  ".task-detail-stacked",
  ".finance-transactions-view__detail",
  ".finance-categories-view__detail",
] as const;

function isInertSubtree(element: Element): boolean {
  return element.closest("[inert]") !== null;
}

export function getTaskPropertyDropdownTrigger(
  id: TaskPropertyDropdownId,
  scope?: ParentNode | null,
): HTMLButtonElement | null {
  const searchRoot = scope ?? document;
  const roots = searchRoot.querySelectorAll(
    `[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}="${id}"]`,
  );

  for (const root of roots) {
    if (!(root instanceof HTMLElement) || !root.isConnected) {
      continue;
    }
    if (isInertSubtree(root)) {
      continue;
    }

    const trigger = root.matches("button")
      ? root
      : root.querySelector("button");

    if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) {
      continue;
    }

    const rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }

    return trigger;
  }

  return null;
}

function resolveSearchableDropdownRoot(
  trigger: HTMLButtonElement,
): HTMLElement | null {
  const parent = trigger.parentElement;
  if (parent instanceof HTMLElement) {
    return parent;
  }

  const marked = trigger.closest(`[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}]`);
  return marked instanceof HTMLElement ? marked : null;
}

function pageHasTaskListPropertyRows(): boolean {
  for (const node of document.querySelectorAll(
    `[${KEYBOARD_NAV_ITEM_ATTR}] [${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}]`,
  )) {
    if (node instanceof HTMLElement && !isInertSubtree(node)) {
      return true;
    }
  }
  return false;
}

/** Bulk editor scope when >1 tasks are selected (see TaskBulkEditBar). */
function resolveTaskBulkPropertyScope(): HTMLElement | null {
  const scope = document.querySelector(
    `[${TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE}]`,
  );
  return scope instanceof HTMLElement && scope.isConnected ? scope : null;
}

function resolveFinanceBulkScope(): HTMLElement | null {
  const scope = document.querySelector(`[${FINANCE_BULK_SCOPE_ATTRIBUTE}]`);
  return scope instanceof HTMLElement &&
    scope.isConnected &&
    !isInertSubtree(scope)
    ? scope
    : null;
}

function resolveFinanceFilterScope(): HTMLElement | null {
  const scope = document.querySelector(`[${FINANCE_FILTER_SCOPE_ATTRIBUTE}]`);
  return scope instanceof HTMLElement &&
    scope.isConnected &&
    !isInertSubtree(scope)
    ? scope
    : null;
}

function resolveTaskDetailPropertyScopes(): ParentNode[] {
  const scopes: ParentNode[] = [];
  for (const selector of TASK_DETAIL_PROPERTY_SCOPE_SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      if (node instanceof HTMLElement && node.isConnected) {
        scopes.push(node);
      }
    }
  }
  return scopes;
}

function tryOpenInScope(
  scope: ParentNode,
  ids: TaskPropertyDropdownId[],
  options?: { centerPlacement?: boolean },
): boolean {
  for (const candidate of ids) {
    const trigger = getTaskPropertyDropdownTrigger(candidate, scope);
    if (!trigger) {
      continue;
    }

    if (options?.centerPlacement) {
      const root = resolveSearchableDropdownRoot(trigger);
      if (root) {
        markSearchableDropdownOpenPlacement(root, "center");
      }
    }

    trigger.click();
    return true;
  }

  return false;
}

/**
 * Shift+hotkeys: prefer finance bulk bar when a selection is active, otherwise
 * the floating filter bar. Panels anchor to the trigger (same as a mouse click).
 */
export function openFinanceChromeDropdown(
  id: TaskPropertyDropdownId | TaskPropertyDropdownId[],
): boolean {
  const ids = Array.isArray(id) ? id : [id];
  requestCloseSearchableDropdowns();

  const bulkScope = resolveFinanceBulkScope();
  if (bulkScope && tryOpenInScope(bulkScope, ids)) {
    return true;
  }

  const filterScope = resolveFinanceFilterScope();
  if (filterScope && tryOpenInScope(filterScope, ids)) {
    return true;
  }

  return false;
}

function resolveFinanceTxDetailScope(): HTMLElement | null {
  const detail = document.querySelector(".finance-transactions-view__detail");
  return detail instanceof HTMLElement && detail.isConnected ? detail : null;
}

/**
 * Finance transaction property hotkeys: prefer the open right detail panel,
 * otherwise the keyboard-highlighted list row.
 */
export function openFinanceTxPropertyDropdown(
  id: TaskPropertyDropdownId | TaskPropertyDropdownId[],
): boolean {
  const ids = Array.isArray(id) ? id : [id];
  requestCloseSearchableDropdowns();

  const detailScope = resolveFinanceTxDetailScope();
  if (detailScope && tryOpenInScope(detailScope, ids)) {
    return true;
  }

  const listScope = resolveTaskListPropertyScope();
  if (listScope && tryOpenInScope(listScope, ids, { centerPlacement: true })) {
    return true;
  }

  return false;
}

export function openTaskPropertyDropdown(
  id: TaskPropertyDropdownId | TaskPropertyDropdownId[],
): boolean {
  const ids = Array.isArray(id) ? id : [id];
  requestCloseSearchableDropdowns();

  const composeScope = resolveComposeModalPropertyScope();
  if (composeScope) {
    return tryOpenInScope(composeScope, ids);
  }

  // Multi-select (>1): open the bulk editor field instead of a single row.
  const bulkScope = resolveTaskBulkPropertyScope();
  if (bulkScope && tryOpenInScope(bulkScope, ids, { centerPlacement: true })) {
    return true;
  }

  // Prefer the keyboard-highlighted / active list row when it exposes the field.
  const listScope = resolveTaskListPropertyScope();
  if (listScope && tryOpenInScope(listScope, ids, { centerPlacement: true })) {
    return true;
  }

  // Highlighted list rows may omit some properties (e.g. inbox has no Status).
  // Also covers agent-console task/inbox detail while list rows still exist.
  for (const scope of resolveTaskDetailPropertyScopes()) {
    if (tryOpenInScope(scope, ids)) {
      return true;
    }
  }

  // Document-wide only when there is no ambiguous list of property rows, or the
  // list row was tried and lacked this property (detail already failed above).
  if (!pageHasTaskListPropertyRows() || listScope) {
    return tryOpenInScope(document, ids);
  }

  return false;
}
