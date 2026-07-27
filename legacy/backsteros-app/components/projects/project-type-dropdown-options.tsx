import type { SearchableDropdownOption } from "@/components/ui/searchable-dropdown";
import {
  getProjectTypeLabel,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "@/lib/project-type";

export function buildProjectTypeDropdownOptions(): SearchableDropdownOption<ProjectType>[] {
  return PROJECT_TYPE_ORDER.map((value) => ({
    value,
    label: getProjectTypeLabel(value),
    searchTerms: `${value} ${getProjectTypeLabel(value)}`,
  }));
}
