import {
  getProjectTypeLabel,
  migrateLegacyProjectType,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "../projects/project-type.js";
import { PROJECT_TYPE_FILTER_ALL } from "../projects/project-type-filters.js";

/** Sentinel for “show every option” in the dropdown type filter. */
export const SEARCHABLE_DROPDOWN_FILTER_ALL = PROJECT_TYPE_FILTER_ALL;

export type SearchableDropdownOptionFilter = {
  value: string;
  label: string;
};

type FilterableOption = {
  filterValue?: string | null;
  filterLabel?: string | null;
};

/**
 * Distinct option filters present in the list, ordered by project-type order
 * when values are known project types. Always prepends All when any filter
 * exists. Returns [] when fewer than two typed options — no bar needed.
 */
export function collectSearchableDropdownOptionFilters(
  options: readonly FilterableOption[],
): SearchableDropdownOptionFilter[] {
  const byValue = new Map<string, string>();
  for (const option of options) {
    const value = option.filterValue?.trim();
    if (!value) continue;
    if (byValue.has(value)) continue;
    const label = option.filterLabel?.trim() || value;
    byValue.set(value, label);
  }
  if (byValue.size < 2) return [];

  const knownOrder = new Map(
    PROJECT_TYPE_ORDER.map((type, index) => [type, index]),
  );
  const typed = [...byValue.entries()].sort(([a], [b]) => {
    const ai = knownOrder.get(a as ProjectType);
    const bi = knownOrder.get(b as ProjectType);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b);
  });

  return [
    { value: SEARCHABLE_DROPDOWN_FILTER_ALL, label: "All" },
    ...typed.map(([value, label]) => ({ value, label })),
  ];
}

/**
 * Keep options that match the active filter. Options without `filterValue`
 * (e.g. “No project”) always remain visible.
 */
export function filterSearchableDropdownOptionsByFilter<
  T extends FilterableOption,
>(options: readonly T[], filter: string): T[] {
  const normalized = filter.trim();
  if (!normalized || normalized === SEARCHABLE_DROPDOWN_FILTER_ALL) {
    return [...options];
  }
  return options.filter((option) => {
    const value = option.filterValue?.trim();
    if (!value) return true;
    return value === normalized;
  });
}

/** Project-type tags for a dropdown option row. */
export function projectTypeDropdownFilter(
  type: string | null | undefined,
): { filterValue: ProjectType; filterLabel: string } {
  const filterValue = migrateLegacyProjectType(type);
  return {
    filterValue,
    filterLabel: getProjectTypeLabel(filterValue),
  };
}
