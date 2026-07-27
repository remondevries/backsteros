import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../lib/task-due-date";
import { isTaskPriorityNone } from "../lib/task-priority";
import { colors } from "../lib/theme";
import { ListAssigneeAvatar } from "./list-assignee-avatar";
import { ProjectIcon } from "./project-icon";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

export type TaskItemListRowTask = {
  id: string;
  title: string | null;
  status: string | null;
  priority?: number | null;
  due_date?: string | null;
  project_name?: string | null;
  display_id?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assigneeAvatarSrc?: string | null;
};

type Props = {
  task: TaskItemListRowTask;
  onPress?: () => void;
  /** Hide project chip (e.g. inside a project’s Tasks section). */
  showProject?: boolean;
  /** j/k keyboard highlight (iPad). */
  highlighted?: boolean;
  /** Master-detail selection (iPad inbox split). */
  selected?: boolean;
};

/**
 * iPad task list row — desktop `TaskItemRow` order:
 * priority → id → status → title | due / project / assignee (far right).
 */
export function TaskItemListRow({
  task,
  onPress,
  showProject = true,
  highlighted = false,
  selected = false,
}: Props) {
  const title = task.title?.trim() || "Untitled";
  const priority = task.priority ?? 0;
  const dueLabel = formatTaskDueMetaLabel(task.due_date);
  const urgency = getTaskDueDateUrgency(task.due_date, new Date(), {
    status: task.status,
  });
  const assigneeName = task.assignee_name?.trim() || null;
  const hasAssignee = Boolean(task.assignee_id || assigneeName);

  const body = (
    <>
      <View style={styles.priority}>
        {!isTaskPriorityNone(priority) ? (
          <TaskPriorityIcon priority={priority} size={14} />
        ) : (
          <View style={styles.priorityPlaceholder} />
        )}
      </View>
      {task.display_id ? (
        <Text style={styles.id} numberOfLines={1}>
          {task.display_id}
        </Text>
      ) : null}
      <View style={styles.status}>
        <TaskStatusIcon status={task.status} size={16} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.properties}>
        {dueLabel ? (
          <View style={styles.due}>
            <TaskDueDateIcon active urgency={urgency} size={12} />
            <Text style={styles.dueLabel} numberOfLines={1}>
              {dueLabel}
            </Text>
          </View>
        ) : null}
        {showProject && task.project_name ? (
          <View style={styles.project}>
            <ProjectIcon size={12} color={colors.muted} />
            <Text style={styles.projectName} numberOfLines={1}>
              {task.project_name}
            </Text>
          </View>
        ) : null}
        {hasAssignee ? (
          <ListAssigneeAvatar
            name={assigneeName}
            src={task.assigneeAvatarSrc}
          />
        ) : null}
      </View>
    </>
  );

  const rowStyle = [
    styles.row,
    selected ? styles.rowSelected : null,
    highlighted ? styles.rowHighlighted : null,
  ];

  if (!onPress) {
    return <View style={rowStyle}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        task.display_id ? `${task.display_id} ${title}` : title
      }
      onPress={onPress}
      style={({ pressed }) => [
        ...rowStyle,
        pressed ? styles.rowPressed : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 6,
  },
  rowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  rowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  rowHighlighted: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: colors.accent,
  },
  priority: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityPlaceholder: {
    width: 14,
    height: 14,
  },
  id: {
    maxWidth: 72,
    color: "rgba(237, 237, 237, 0.45)",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontFamily: "Menlo",
  },
  status: {
    width: 18,
    alignItems: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 18,
  },
  properties: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
    maxWidth: "42%",
  },
  due: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 120,
  },
  dueLabel: {
    color: "rgba(237, 237, 237, 0.55)",
    fontSize: 12,
    flexShrink: 1,
  },
  project: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 140,
  },
  projectName: {
    color: "rgba(237, 237, 237, 0.55)",
    fontSize: 12,
    flexShrink: 1,
  },
});
