import { TaskPriorityIcon } from "@/components/task-priority/task-priority-icon";
import type { SearchableDropdownOption } from "@/components/ui/searchable-dropdown";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_ORDER,
  type TaskPriorityDropdownValue,
} from "@/lib/task-priority";

export function buildTaskPriorityDropdownOptions(): SearchableDropdownOption<TaskPriorityDropdownValue>[] {
  return TASK_PRIORITY_ORDER.map((value) => {
    const label = getTaskPriorityLabel(value);
    return {
      value: String(value) as TaskPriorityDropdownValue,
      label,
      icon: <TaskPriorityIcon priority={value} title={label} size={14} />,
    };
  });
}
