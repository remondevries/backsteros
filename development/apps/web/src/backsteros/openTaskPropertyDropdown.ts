import {
  TASK_PROPERTY_DROPDOWN_ATTRIBUTE,
  type TaskPropertyDropdownId,
} from "./taskPropertyDropdownKeys";
import { resolveBacksterosComposeModalPropertyScope } from "./compose-modal-shortcut-target";

function isInertSubtree(element: Element): boolean {
  return element.closest("[inert]") !== null;
}

export function getTaskPropertyDropdownTrigger(
  id: TaskPropertyDropdownId,
  scope?: ParentNode | null,
): HTMLButtonElement | null {
  const searchRoot = scope ?? document;
  const roots = searchRoot.querySelectorAll(`[${TASK_PROPERTY_DROPDOWN_ATTRIBUTE}="${id}"]`);

  for (const root of roots) {
    if (!(root instanceof HTMLElement) || !root.isConnected) continue;
    if (isInertSubtree(root)) continue;

    const trigger = root.matches("button") ? root : root.querySelector("button");

    if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) continue;

    const rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    return trigger;
  }

  return null;
}

function tryOpenInScope(scope: ParentNode, ids: readonly TaskPropertyDropdownId[]): boolean {
  for (const candidate of ids) {
    const trigger = getTaskPropertyDropdownTrigger(candidate, scope);
    if (!trigger) continue;
    trigger.click();
    return true;
  }
  return false;
}

/**
 * Open the first available property dropdown for the given id candidates
 * (desktop `openTaskPropertyDropdown` parity — compose modal wins while open).
 */
export function openTaskPropertyDropdown(
  id: TaskPropertyDropdownId | TaskPropertyDropdownId[],
  scope?: ParentNode | null,
): boolean {
  const ids = Array.isArray(id) ? id : [id];

  // Explicit scope (tests / callers) always wins.
  if (scope) {
    return tryOpenInScope(scope, ids);
  }

  // Desktop: while create-task compose is open, only its chips receive S/P/A/….
  const composeScope = resolveBacksterosComposeModalPropertyScope();
  if (composeScope) {
    return tryOpenInScope(composeScope, ids);
  }

  return tryOpenInScope(document, ids);
}
