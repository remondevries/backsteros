import { TaskStatusIcon } from "@/components/task-status";
import type { SearchableDropdownOption } from "@/components/ui/searchable-dropdown";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "@/lib/task-status";

export function buildTaskStatusDropdownOptions(): SearchableDropdownOption<TaskStatus>[] {
  return TASK_STATUS_ORDER.map((value) => {
    const label = getTaskStatusLabel(value);
    return {
      value,
      label,
      searchTerms: value.replaceAll("_", " "),
      icon: <TaskStatusIcon status={value} title={label} size={14} />,
    };
  });
}
