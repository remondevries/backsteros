import { requestCloseSearchableDropdowns } from "@/lib/searchable-dropdown-events";
import { markSearchableDropdownOpenPlacement } from "@/lib/searchable-dropdown-open-placement";
import { resolveComposeModalPropertyScope } from "@/lib/shortcuts/compose-modal-shortcut-target";
import { KEYBOARD_NAV_ITEM_ATTR } from "@/lib/shortcuts/keyboard-nav-item";

import { resolveTaskListPropertyScope } from "./resolve-task-list-property-scope";
import type { TaskPropertyDropdownId } from "./task-property-dropdown-keys";
import { TASK_PROPERTY_DROPDOWN_ATTRIBUTE } from "./task-property-dropdown-keys";

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

export function openTaskPropertyDropdown(
  id: TaskPropertyDropdownId | TaskPropertyDropdownId[],
): boolean {
  const ids = Array.isArray(id) ? id : [id];
  requestCloseSearchableDropdowns();

  const composeScope = resolveComposeModalPropertyScope();
  const listScope = resolveTaskListPropertyScope();
  const scopes: ParentNode[] = composeScope
    ? [composeScope]
    : listScope
      ? [listScope]
      : pageHasTaskListPropertyRows()
        ? []
        : [document];

  for (const scope of scopes) {
    for (const candidate of ids) {
      const trigger = getTaskPropertyDropdownTrigger(candidate, scope);
      if (!trigger) {
        continue;
      }

      if (listScope && scope === listScope) {
        const root = resolveSearchableDropdownRoot(trigger);
        if (root) {
          markSearchableDropdownOpenPlacement(root, "center");
        }
      }

      trigger.click();
      return true;
    }
  }

  // Highlighted list row may not expose every property (e.g. assignee). Prefer the
  // open detail panel in main content over a document-wide first match.
  if (listScope && !composeScope) {
    const mainSlot = document.querySelector(".main-slot");
    if (mainSlot) {
      for (const candidate of ids) {
        const trigger = getTaskPropertyDropdownTrigger(candidate, mainSlot);
        if (!trigger) {
          continue;
        }
        trigger.click();
        return true;
      }
    }
  }

  return false;
}
