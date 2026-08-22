export const SEARCHABLE_DROPDOWN_OPEN_PLACEMENT_ATTRIBUTE =
  "data-searchable-dropdown-open-placement";

export type SearchableDropdownOpenPlacement = "anchored" | "center";

export function markSearchableDropdownOpenPlacement(
  root: HTMLElement,
  placement: SearchableDropdownOpenPlacement,
): void {
  root.dataset.searchableDropdownOpenPlacement = placement;
}

export function consumeSearchableDropdownOpenPlacement(
  root: HTMLElement | null,
  fallback: SearchableDropdownOpenPlacement,
): SearchableDropdownOpenPlacement {
  const placement = root?.dataset.searchableDropdownOpenPlacement;
  if (root && placement === "center") {
    delete root.dataset.searchableDropdownOpenPlacement;
    return "center";
  }

  if (root?.dataset.searchableDropdownOpenPlacement) {
    delete root.dataset.searchableDropdownOpenPlacement;
  }

  return fallback;
}
