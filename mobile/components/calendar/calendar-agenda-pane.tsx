import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  formatCalendarTaskTime,
  tasksDueOnCalendarDay,
  type CalendarDayTaskRow,
} from "../../lib/calendar/calendar-day-tasks";
import { formatMeetingDisplayId } from "../../lib/meeting-display-id";
import { taskDetailHref } from "../../lib/detail-href";
import { formatLocalYmd, getTaskDueDateYmd } from "../../lib/task-due-date";
import { getTaskDisplayId } from "../../lib/task-display-id";
import { TASK_LIST_SELECT } from "../../lib/task-list-query";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useLocalQuery } from "../../lib/use-local-query";
import { BacksterFlashList } from "../lists/index";
import { OrganizationIcon } from "../organization-icon";
import { ProjectOcticon } from "../project-octicon";
import { TaskStatusIcon } from "../task-status-icon";
import { CalendarHeader } from "./calendar-header";
import { CalendarWeekStrip } from "./calendar-week-strip";

export type CalendarAgendaRow = {
  id: string;
  number: number | null;
  title: string | null;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
  project_id: string | null;
  organization_id: string | null;
  project_name?: string | null;
  project_key?: string | null;
  project_icon?: string | null;
  project_type?: string | null;
  organization_name?: string | null;
};

const UPCOMING_MEETINGS_SQL = `
SELECT
  m.id,
  m.number,
  m.title,
  m.status,
  m.start_at,
  m.end_at,
  m.project_id,
  m.organization_id,
  p.name AS project_name,
  p.key AS project_key,
  p.icon AS project_icon,
  p.type AS project_type,
  o.name AS organization_name
FROM meetings m
LEFT JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
LEFT JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
WHERE m.deleted_at IS NULL
  AND m.start_at IS NOT NULL
  AND datetime(m.start_at) >= datetime('now', '-1 day')
ORDER BY m.start_at ASC
`;

const SCHEDULED_TASKS_SQL = `${TASK_LIST_SELECT}
WHERE t.deleted_at IS NULL
  AND t.due_date IS NOT NULL
  AND t.due_date != ''
  AND t.habit_id IS NULL
ORDER BY t.due_date ASC`;

type AgendaSection = {
  key: string;
  title: string;
  meetings: CalendarAgendaRow[];
  tasks: CalendarDayTaskRow[];
};

type AgendaListItem =
  | { kind: "header"; key: string; title: string }
  | { kind: "meeting"; key: string; row: CalendarAgendaRow }
  | { kind: "task"; key: string; row: CalendarDayTaskRow };

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function meetingDayYmd(startAt: string | null): string | null {
  if (!startAt) return null;
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalYmd(date);
}

function groupAgendaByDay(
  meetings: CalendarAgendaRow[],
  tasks: CalendarDayTaskRow[],
  anchorDay: Date,
): AgendaSection[] {
  const anchor = startOfLocalDay(anchorDay);
  const tomorrow = addDays(anchor, 1);
  const weekEnd = addDays(startOfWeekMonday(anchor), 7);

  const meetingBuckets: Record<string, CalendarAgendaRow[]> = {
    today: [],
    tomorrow: [],
    week: [],
    later: [],
  };
  const taskBuckets: Record<string, CalendarDayTaskRow[]> = {
    today: [],
    tomorrow: [],
    week: [],
    later: [],
  };

  for (const row of meetings) {
    if (!row.start_at) {
      meetingBuckets.later.push(row);
      continue;
    }
    const start = new Date(row.start_at);
    if (Number.isNaN(start.getTime())) {
      meetingBuckets.later.push(row);
      continue;
    }
    const day = startOfLocalDay(start);
    if (day.getTime() === anchor.getTime()) meetingBuckets.today.push(row);
    else if (day.getTime() === tomorrow.getTime()) meetingBuckets.tomorrow.push(row);
    else if (day < weekEnd) meetingBuckets.week.push(row);
    else meetingBuckets.later.push(row);
  }

  for (const task of tasks) {
    const ymd = getTaskDueDateYmd(task.due_date);
    if (!ymd) continue;
    const day = startOfLocalDay(new Date(task.due_date!));
    if (day.getTime() === anchor.getTime()) taskBuckets.today.push(task);
    else if (day.getTime() === tomorrow.getTime()) taskBuckets.tomorrow.push(task);
    else if (day < weekEnd) taskBuckets.week.push(task);
    else taskBuckets.later.push(task);
  }

  const sections: AgendaSection[] = [];
  if (meetingBuckets.today.length || taskBuckets.today.length) {
    sections.push({
      key: "today",
      title:
        anchor.getTime() === startOfLocalDay(new Date()).getTime()
          ? "Today"
          : anchor.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            }),
      meetings: meetingBuckets.today,
      tasks: taskBuckets.today,
    });
  }
  if (meetingBuckets.tomorrow.length || taskBuckets.tomorrow.length) {
    sections.push({
      key: "tomorrow",
      title: "Tomorrow",
      meetings: meetingBuckets.tomorrow,
      tasks: taskBuckets.tomorrow,
    });
  }
  if (meetingBuckets.week.length || taskBuckets.week.length) {
    sections.push({
      key: "week",
      title: "Later this week",
      meetings: meetingBuckets.week,
      tasks: taskBuckets.week,
    });
  }
  if (meetingBuckets.later.length || taskBuckets.later.length) {
    sections.push({
      key: "later",
      title: "Later",
      meetings: meetingBuckets.later,
      tasks: taskBuckets.later,
    });
  }
  return sections;
}

function formatAgendaTime(startAt: string | null, endAt: string | null): string {
  if (!startAt) return "";
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return startAt;
  const startLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endAt) return startLabel;
  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) return startLabel;
  const endLabel = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}

function MeetingAgendaRow({
  row,
  onPress,
}: {
  row: CalendarAgendaRow;
  onPress: () => void;
}) {
  const title = row.title?.trim() || "Untitled meeting";
  const when = formatAgendaTime(row.start_at, row.end_at);
  const projectLabel =
    row.project_name?.trim() || row.project_key?.trim() || null;
  const orgLabel = row.organization_name?.trim() || null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowTop}>
        <View style={styles.rowLeading}>
          <TaskStatusIcon status={row.status} size={14} />
          <Text style={styles.displayId}>
            {formatMeetingDisplayId(row.number)}
          </Text>
        </View>
        {when ? <Text style={styles.when}>{when}</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {projectLabel || orgLabel ? (
        <View style={styles.metaRow}>
          {projectLabel ? (
            <View style={styles.metaChip}>
              <ProjectOcticon
                size={12}
                color={colors.muted}
                icon={row.project_icon}
                type={row.project_type}
              />
              <Text style={styles.metaText}>{projectLabel}</Text>
            </View>
          ) : null}
          {orgLabel ? (
            <View style={styles.metaChip}>
              <OrganizationIcon size={12} color={colors.muted} />
              <Text style={styles.metaText}>{orgLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function TaskAgendaRow({
  row,
  onPress,
}: {
  row: CalendarDayTaskRow;
  onPress: () => void;
}) {
  const title = row.title?.trim() || "Untitled task";
  const when = formatCalendarTaskTime(row.due_date, row.due_end_date);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowTop}>
        <View style={styles.rowLeading}>
          <TaskStatusIcon status={row.status} size={14} />
          <Text style={styles.displayId}>
            {getTaskDisplayId(
              { number: row.number },
              row.project_key,
            ) ?? "Task"}
          </Text>
        </View>
        {when ? <Text style={styles.when}>{when}</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

type Props = {
  selectedId?: string | null;
  onPressRow?: (row: CalendarAgendaRow) => void;
  selectedDay?: Date;
  onSelectedDayChange?: (day: Date) => void;
};

export function CalendarAgendaPane({
  selectedId = null,
  onPressRow,
  selectedDay: selectedDayProp,
  onSelectedDayChange,
}: Props) {
  const router = useRouter();
  const [internalDay, setInternalDay] = useState(() =>
    startOfLocalDay(new Date()),
  );
  const selectedDay = selectedDayProp ?? internalDay;
  const setSelectedDay = onSelectedDayChange ?? setInternalDay;

  const { data: rows, isLoading } =
    useLocalQuery<CalendarAgendaRow>(UPCOMING_MEETINGS_SQL);
  const { data: taskRows, isLoading: tasksLoading } =
    useLocalQuery<CalendarDayTaskRow>(SCHEDULED_TASKS_SQL);

  const filteredRows = useMemo(() => {
    const selectedYmd = formatLocalYmd(selectedDay);
    const weekStart = startOfWeekMonday(selectedDay);
    const weekEnd = addDays(weekStart, 7);
    return rows.filter((row) => {
      const ymd = meetingDayYmd(row.start_at);
      if (!ymd) return false;
      const day = startOfLocalDay(new Date(row.start_at!));
      if (ymd === selectedYmd) return true;
      return day >= selectedDay && day < weekEnd;
    });
  }, [rows, selectedDay]);

  const filteredTasks = useMemo(() => {
    const weekStart = startOfWeekMonday(selectedDay);
    const weekEnd = addDays(weekStart, 7);
    return (taskRows ?? []).filter((task) => {
      const ymd = getTaskDueDateYmd(task.due_date);
      if (!ymd) return false;
      const day = startOfLocalDay(new Date(task.due_date!));
      const selectedYmd = formatLocalYmd(selectedDay);
      if (ymd === selectedYmd) return true;
      return day >= selectedDay && day < weekEnd;
    });
  }, [selectedDay, taskRows]);

  const sections = useMemo(
    () => groupAgendaByDay(filteredRows, filteredTasks, selectedDay),
    [filteredRows, filteredTasks, selectedDay],
  );

  const flatData = useMemo((): AgendaListItem[] => {
    return sections.flatMap((section) => {
      const items: AgendaListItem[] = [
        { kind: "header", key: `header:${section.key}`, title: section.title },
      ];
      for (const row of section.meetings) {
        items.push({ kind: "meeting", key: `meeting:${row.id}`, row });
      }
      for (const row of section.tasks) {
        items.push({ kind: "task", key: `task:${row.id}`, row });
      }
      return items;
    });
  }, [sections]);

  const onPress = useCallback(
    (row: CalendarAgendaRow) => {
      if (onPressRow) {
        onPressRow(row);
        return;
      }
      router.push(`/meeting/${encodeURIComponent(row.id)}`);
    },
    [onPressRow, router],
  );

  if (isLoading && tasksLoading && rows.length === 0 && taskRows.length === 0) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <View style={ui.screen}>
      <BacksterFlashList
        data={flatData}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={
          <>
            <CalendarHeader selectedDay={selectedDay} />
            <CalendarWeekStrip
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </>
        }
        ListEmptyComponent={
          <Text style={[ui.body, styles.empty]}>
            No meetings or tasks for this week.
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === "header") {
            return <Text style={styles.sectionTitle}>{item.title}</Text>;
          }
          if (item.kind === "meeting") {
            const selected = selectedId === item.row.id;
            return (
              <View style={selected ? styles.selectedWrap : undefined}>
                <MeetingAgendaRow
                  row={item.row}
                  onPress={() => onPress(item.row)}
                />
              </View>
            );
          }
          return (
            <TaskAgendaRow
              row={item.row}
              onPress={() => router.push(taskDetailHref(item.row.id))}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.muted,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.screenX,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.screenX,
    paddingBottom: 4,
  },
  row: {
    paddingHorizontal: spacing.screenX,
    paddingVertical: spacing.rowY,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  selectedWrap: {
    backgroundColor: colors.surface,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  rowLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  displayId: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  when: {
    color: colors.muted,
    fontSize: 12,
  },
  title: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
  },
});
