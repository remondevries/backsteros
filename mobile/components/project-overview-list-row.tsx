import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatTaskDueMetaLabel } from "../lib/task-due-date";
import {
  getTaskPriorityLabel,
  isTaskPriorityNone,
} from "../lib/task-priority";
import { formatProjectTaskProgressPercent } from "../lib/project-progress-ring";
import type { ProjectTaskProgress } from "../lib/project-progress-ring";
import { colors } from "../lib/theme";
import { ProjectOcticon } from "./project-octicon";
import { ProjectProgressRing } from "./project-progress-ring";
import { ProjectStatusIcon } from "./project-status-icon";
import { TaskPriorityIcon } from "./task-priority-icon";

export type ProjectOverviewListRowProject = {
  id: string;
  key: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
  icon?: string | null;
  priority?: number | null;
  start_date?: string | null;
  due_date?: string | null;
};

type Props = {
  project: ProjectOverviewListRowProject;
  progress: ProjectTaskProgress;
  onPress: () => void;
  /** j/k keyboard highlight (iPad). */
  highlighted?: boolean;
};

/**
 * iPad project list row — desktop `ProjectOverviewRow` columns without
 * inline editors (tap opens detail).
 */
export function ProjectOverviewListRow({
  project,
  progress,
  onPress,
  highlighted = false,
}: Props) {
  const title = project.name?.trim() || "Untitled";
  const key = project.key?.trim() || "";
  const priority = project.priority ?? 0;
  const startLabel = formatTaskDueMetaLabel(project.start_date);
  const dueLabel = formatTaskDueMetaLabel(project.due_date);
  const percentLabel = formatProjectTaskProgressPercent(progress);
  const issuesLabel = progress.total > 0 ? String(progress.total) : "—";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${percentLabel} complete`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        highlighted ? styles.rowHighlighted : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={styles.name}>
        <ProjectOcticon
          icon={project.icon}
          type={project.type}
          size={14}
          color={colors.foreground}
        />
        {key ? <Text style={styles.key}>{key}</Text> : null}
        <View style={styles.statusIcon}>
          <ProjectStatusIcon status={project.status} size={14} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={styles.priority}>
        {!isTaskPriorityNone(priority) ? (
          <TaskPriorityIcon priority={priority} size={14} />
        ) : (
          <Text style={styles.mutedDash}>—</Text>
        )}
      </View>

      <View style={styles.dates}>
        <Text style={styles.dateText} numberOfLines={1}>
          {startLabel ?? "—"}
        </Text>
        <Text style={styles.dateSep}>›</Text>
        <Text style={styles.dateText} numberOfLines={1}>
          {dueLabel ?? "—"}
        </Text>
      </View>

      <Text style={styles.issues}>{issuesLabel}</Text>

      <View style={styles.progress}>
        <Text style={styles.progressLabel}>{percentLabel}</Text>
        <ProjectProgressRing progress={progress} size={14} />
      </View>
    </Pressable>
  );
}

export function ProjectOverviewListHeader() {
  return (
    <View style={styles.header} accessibilityRole="header">
      <Text style={[styles.headerCell, styles.headerName]}>Name</Text>
      <Text style={[styles.headerCell, styles.headerPriority]}>Priority</Text>
      <Text style={[styles.headerCell, styles.headerDates]}>Dates</Text>
      <Text style={[styles.headerCell, styles.headerIssues]}>Issues</Text>
      <Text style={[styles.headerCell, styles.headerProgress]}>Status</Text>
    </View>
  );
}

const COL = {
  priority: 48,
  dates: 140,
  issues: 44,
  progress: 64,
} as const;

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerCell: {
    color: "rgba(237, 237, 237, 0.4)",
    fontSize: 12,
    fontWeight: "500",
  },
  headerName: {
    flex: 1,
    minWidth: 0,
  },
  headerPriority: {
    width: COL.priority,
    textAlign: "center",
  },
  headerDates: {
    width: COL.dates,
  },
  headerIssues: {
    width: COL.issues,
    textAlign: "center",
  },
  headerProgress: {
    width: COL.progress,
    textAlign: "right",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 6,
  },
  rowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  rowHighlighted: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: colors.accent,
  },
  name: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  key: {
    flexShrink: 0,
    color: "rgba(237, 237, 237, 0.45)",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontFamily: "Menlo",
  },
  statusIcon: {
    width: 14,
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
  priority: {
    width: COL.priority,
    alignItems: "center",
    justifyContent: "center",
  },
  mutedDash: {
    color: "rgba(237, 237, 237, 0.35)",
    fontSize: 12,
  },
  dates: {
    width: COL.dates,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  dateText: {
    flexShrink: 1,
    color: "rgba(237, 237, 237, 0.45)",
    fontSize: 12,
  },
  dateSep: {
    color: "rgba(237, 237, 237, 0.35)",
    fontSize: 12,
  },
  issues: {
    width: COL.issues,
    textAlign: "center",
    color: "rgba(237, 237, 237, 0.45)",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  progress: {
    width: COL.progress,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  progressLabel: {
    color: "rgba(237, 237, 237, 0.45)",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
