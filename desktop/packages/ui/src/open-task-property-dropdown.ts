import { requestCloseSearchableDropdowns } from "./searchable-dropdown-events.js";
import { markSearchableDropdownOpenPlacement } from "./searchable-dropdown-open-placement.js";
import { resolveComposeModalPropertyScope } from "./compose-modal-shortcut-target.js";
import { KEYBOARD_NAV_ITEM_ATTR } from "./keyboard-nav-item.js";
import { resolveTaskListPropertyScope } from "./resolve-task-list-property-scope.js";
import {
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
  return (
    document.querySelector(
      `[${KEYBOARD_NAV_ITEM_ATTR}] [${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}]`,
    ) !== null
  );
}

/** Bulk editor scope when >1 tasks are selected (see TaskBulkEditBar). */
function resolveTaskBulkPropertyScope(): HTMLElement | null {
  const scope = document.querySelector(
    `[${TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE}]`,
  );
  return scope instanceof HTMLElement && scope.isConnected ? scope : null;
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
