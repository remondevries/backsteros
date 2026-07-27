import type { SearchableDropdownOption } from "@/components/ui/searchable-dropdown";
import {
  getProjectAreaLabel,
  PROJECT_AREA_ORDER,
  type ProjectArea,
} from "@/lib/project-areas";

export type ProjectAreaDropdownValue = ProjectArea | "none";

export function buildProjectAreaDropdownOptions(): SearchableDropdownOption<ProjectAreaDropdownValue>[] {
  return [
    {
      value: "none",
      label: "No area",
      searchTerms: "none unassigned",
    },
    ...PROJECT_AREA_ORDER.map((value) => ({
      value,
      label: getProjectAreaLabel(value),
      searchTerms: value,
    })),
  ];
}

export function toProjectAreaDropdownValue(
  area: ProjectArea | null | undefined,
): ProjectAreaDropdownValue {
  return area ?? "none";
}

export function fromProjectAreaDropdownValue(
  value: ProjectAreaDropdownValue,
): ProjectArea | null {
  return value === "none" ? null : value;
}
