import type { ReactNode } from "react";
import { Text, View } from "react-native";

import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../lib/task-due-date";
import {
  getTaskPriorityLabel,
  isTaskPriorityNone,
} from "../lib/task-priority";
import { ui } from "../lib/ui";
import { ProjectIcon } from "./project-icon";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";

export type TaskPropertyPillFields = {
  priority?: number | null;
  status?: string | null;
  due_date?: string | null;
  project_name?: string | null;
};

type Props = {
  row: TaskPropertyPillFields;
};

/**
 * Read-only property chips — Priority → Due date → Project (desktop order,
 * without dropdowns or task IDs).
 */
export function TaskPropertyPills({ row }: Props) {
  const pills: Array<{ key: string; icon: ReactNode; label: string }> = [];

  if (!isTaskPriorityNone(row.priority)) {
    pills.push({
      key: "priority",
      icon: <TaskPriorityIcon priority={row.priority} size={12} />,
      label: getTaskPriorityLabel(row.priority),
    });
  }

  const dueLabel = formatTaskDueMetaLabel(row.due_date);
  if (dueLabel) {
    const urgency = getTaskDueDateUrgency(row.due_date, new Date(), {
      status: row.status,
    });
    pills.push({
      key: "due",
      icon: <TaskDueDateIcon active urgency={urgency} size={12} />,
      label: dueLabel,
    });
  }

  if (row.project_name) {
    pills.push({
      key: "project",
      icon: <ProjectIcon size={12} />,
      label: row.project_name,
    });
  }

  if (pills.length === 0) return null;

  return (
    <View style={ui.pillRow}>
      {pills.map((pill) => (
        <View key={pill.key} style={ui.pill}>
          {pill.icon}
          <Text style={ui.pillLabel} numberOfLines={1}>
            {pill.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
