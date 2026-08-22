import { Pressable, StyleSheet, Text, View } from "react-native";

import { resolveInboxEmailIconColor } from "../lib/email-list";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../lib/task-due-date";
import { getTaskPriorityLabel } from "../lib/task-priority";
import { TASK_STATUS_COLORS } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ListAssigneeAvatar } from "./list-assignee-avatar";
import { EmailNavIcon } from "./nav-icons";
import { ProjectOcticon } from "./project-octicon";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

export type InboxListItemRowTask = {
  id: string;
  title: string | null;
  status?: string | null;
  priority?: number | null;
  due_date?: string | null;
  project_name?: string | null;
  project_key?: string | null;
  project_icon?: string | null;
  project_type?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assigneeAvatarSrc?: string | null;
  /** Email thread rows (desktop inbox parity) render an email type icon. */
  item_type?: "task" | "email" | null;
  /** Email rows: sender label shown in the meta line. */
  email_from?: string | null;
};

type Props = {
  task: InboxListItemRowTask;
  onPress?: () => void;
  highlighted?: boolean;
  selected?: boolean;
};

/**
 * Desktop inbox side-panel row — stacked primary + meta:
 * status icon · title
 * priority · due · project · assignee
 * (`InboxListItemRow` / `.app-side-panel-item-stacked`).
 */
export function InboxListItemRow({
  task,
  onPress,
  highlighted = false,
  selected = false,
}: Props) {
  const title = task.title?.trim() || "Untitled";
  const priority = task.priority ?? 0;
  const priorityLabel = getTaskPriorityLabel(priority);
  const dueLabel = formatTaskDueMetaLabel(task.due_date);
  const urgency = getTaskDueDateUrgency(task.due_date, new Date(), {
    status: task.status,
  });
  const projectLabel =
    task.project_name?.trim() || task.project_key?.trim() || null;
  const assigneeName = task.assignee_name?.trim() || null;
  const hasAssignee = Boolean(task.assignee_id || assigneeName);

  const isEmail = task.item_type === "email";
  const emailFrom = isEmail ? task.email_from?.trim() || null : null;

  const body = (
    <>
      <View style={styles.primary}>
        <View style={styles.typeIcon} accessibilityElementsHidden>
          {isEmail ? (
            <EmailNavIcon
              size={13}
              color={resolveInboxEmailIconColor(task.status)}
            />
          ) : (
            <TaskStatusIcon status={task.status} size={14} />
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.meta}>
        {emailFrom ? (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} numberOfLines={1}>
              {emailFrom}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaItem}>
          <TaskPriorityIcon priority={priority} size={14} />
          <Text style={styles.metaLabel} numberOfLines={1}>
            {priorityLabel}
          </Text>
        </View>
        {dueLabel ? (
          <View style={styles.metaItem}>
            <TaskDueDateIcon active urgency={urgency} size={12} />
            <Text
              style={[
                styles.metaLabel,
                urgency === "overdue" ? styles.metaLabelLate : null,
              ]}
              numberOfLines={1}
            >
              {dueLabel}
            </Text>
          </View>
        ) : null}
        {projectLabel ? (
          <View style={styles.metaItem}>
            <ProjectOcticon
              icon={task.project_icon}
              type={task.project_type}
              size={12}
              color="rgba(237, 237, 237, 0.45)"
            />
            <Text style={styles.metaLabel} numberOfLines={1}>
              {projectLabel}
            </Text>
          </View>
        ) : null}
        {hasAssignee ? (
          <View style={styles.assignee}>
            <ListAssigneeAvatar
              name={assigneeName}
              src={task.assigneeAvatarSrc}
            />
          </View>
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
      accessibilityLabel={title}
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
    marginHorizontal: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
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
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  typeIcon: {
    width: 14,
    height: 14,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    flexShrink: 1,
  },
  metaLabel: {
    color: "rgba(237, 237, 237, 0.5)",
    fontSize: 11,
    lineHeight: 14,
    flexShrink: 1,
  },
  metaLabelLate: {
    color: TASK_STATUS_COLORS.on_hold,
  },
  assignee: {
    marginLeft: "auto",
  },
});
