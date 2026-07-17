import { requestCloseSearchableDropdowns } from "@/lib/searchable-dropdown-events";

export const SEARCHABLE_DROPDOWN_ROOT_ATTRIBUTE = "data-searchable-dropdown-root";

function isDropdownRootVisible(root: HTMLElement): boolean {
  const trigger = root.querySelector('button[aria-haspopup="listbox"]');
  if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) {
    return false;
  }

  if (root.closest("[hidden]")) {
    return false;
  }

  const style = window.getComputedStyle(root);
  return style.display !== "none" && style.visibility !== "hidden";
}

function compareDropdownRootPosition(a: HTMLElement, b: HTMLElement): number {
  const rectA = a.getBoundingClientRect();
  const rectB = b.getBoundingClientRect();
  const topDiff = rectA.top - rectB.top;

  if (Math.abs(topDiff) > 4) {
    return topDiff;
  }

  return rectA.left - rectB.left;
}

function resolveDropdownChainScope(currentRoot: HTMLElement): ParentNode {
  let ancestor: HTMLElement | null = currentRoot.parentElement;

  while (ancestor) {
    const roots = Array.from(
      ancestor.querySelectorAll<HTMLElement>(
        `[${SEARCHABLE_DROPDOWN_ROOT_ATTRIBUTE}]`,
      ),
    ).filter(isDropdownRootVisible);

    if (roots.length >= 2 && roots.includes(currentRoot)) {
      return ancestor;
    }

    ancestor = ancestor.parentElement;
  }

  return document;
}

export function getOrderedSearchableDropdownRoots(
  scope: ParentNode,
): HTMLElement[] {
  return Array.from(
    scope.querySelectorAll<HTMLElement>(
      `[${SEARCHABLE_DROPDOWN_ROOT_ATTRIBUTE}]`,
    ),
  )
    .filter(isDropdownRootVisible)
    .sort(compareDropdownRootPosition);
}

function openSearchableDropdownRoot(root: HTMLElement): void {
  const trigger = root.querySelector('button[aria-haspopup="listbox"]');
  if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) {
    return;
  }

  trigger.click();
}

export function openAdjacentSearchableDropdown(
  currentRoot: HTMLElement | null,
  direction: "next" | "previous",
): boolean {
  if (!currentRoot) {
    return false;
  }

  const scope = resolveDropdownChainScope(currentRoot);
  const roots = getOrderedSearchableDropdownRoots(scope);
  const currentIndex = roots.indexOf(currentRoot);

  if (currentIndex === -1) {
    return false;
  }

  const adjacentIndex =
    direction === "next" ? currentIndex + 1 : currentIndex - 1;
  const adjacentRoot = roots[adjacentIndex];

  if (!adjacentRoot) {
    return false;
  }

  requestCloseSearchableDropdowns();
  window.requestAnimationFrame(() => {
    openSearchableDropdownRoot(adjacentRoot);
  });

  return true;
}
