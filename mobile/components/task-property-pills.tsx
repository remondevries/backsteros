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
import { ListAssigneeAvatar } from "./list-assignee-avatar";
import { ProjectIcon } from "./project-icon";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";

export type TaskPropertyPillFields = {
  priority?: number | null;
  status?: string | null;
  due_date?: string | null;
  project_name?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
};

type Props = {
  row: TaskPropertyPillFields;
  assigneeAvatarSrc?: string | null;
};

/**
 * Read-only property chips — Priority → Due → Project → Assignee avatar
 * (desktop trailing order, without dropdowns or task IDs).
 */
export function TaskPropertyPills({ row, assigneeAvatarSrc }: Props) {
  const pills: Array<{ key: string; icon: ReactNode; label?: string }> = [];

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

  const hasAssignee = Boolean(row.assignee_id || row.assignee_name?.trim());
  if (hasAssignee) {
    pills.push({
      key: "assignee",
      icon: (
        <ListAssigneeAvatar
          name={row.assignee_name}
          src={assigneeAvatarSrc}
        />
      ),
    });
  }

  if (pills.length === 0) return null;

  return (
    <View style={ui.pillRow}>
      {pills.map((pill) => (
        <View key={pill.key} style={ui.pill}>
          {pill.icon}
          {pill.label ? (
            <Text style={ui.pillLabel} numberOfLines={1}>
              {pill.label}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
