import { ProjectStatusIcon } from "@/components/project-status";
import type { SearchableDropdownOption } from "@/components/ui/searchable-dropdown";
import {
  getProjectStatusLabel,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "@/lib/project-status";

export function buildProjectStatusDropdownOptions(): SearchableDropdownOption<ProjectStatus>[] {
  return PROJECT_STATUS_ORDER.map((value) => {
    const label = getProjectStatusLabel(value);
    return {
      value,
      label,
      searchTerms: value.replaceAll("_", " "),
      icon: <ProjectStatusIcon status={value} title={label} size={14} />,
    };
  });
}
