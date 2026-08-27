import { meetingBelongsInInbox } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  formatCalendarTaskTime,
  tasksDueOnCalendarDay,
} from "../../lib/calendar/calendar-day-tasks";
import { unscheduledCalendarTasks } from "../../lib/calendar-unscheduled-tasks";
import { taskDetailHref } from "../../lib/detail-href";
import { formatMeetingDisplayId } from "../../lib/meeting-display-id";
import { recordHabitDay } from "../../lib/habits/api";
import { getTaskDueDateYmd } from "../../lib/habits/dates";
import { formatLocalYmd } from "../../lib/task-due-date";
import { getTaskDisplayId } from "../../lib/task-display-id";
import { TASK_LIST_SELECT } from "../../lib/task-list-query";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useLocalQuery } from "../../lib/use-local-query";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { TaskStatusIcon } from "../task-status-icon";
import {
  TasksTodayHabitsChips,
  type HabitCheckChipItem,
} from "../tasks-today-habits-chips";

type SyncedHabitMeta = {
  id: string;
  title: string | null;
  icon: string | null;
  sort_order: number | null;
};

type SyncedHabitTask = {
  id: string;
  habit_id: string | null;
  title: string | null;
  status: string | null;
  due_date: string | null;
};

type UnscheduledTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  habit_id: string | null;
  project_name: string | null;
  project_key: string | null;
  number: number | null;
  project_id: string | null;
  contact_id: string | null;
  sort_order: number | null;
};

type ScheduledTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  due_end_date: string | null;
  habit_id: string | null;
  number: number | null;
  project_name: string | null;
  project_key: string | null;
};

type InboxMeetingRow = {
  id: string;
  title: string | null;
  status: string | null;
  number: number | null;
};

const HABITS_META_SQL = `SELECT id, title, icon, sort_order FROM habits
 WHERE deleted_at IS NULL`;

const HABIT_TASKS_SQL = `SELECT id, habit_id, title, status, due_date FROM tasks
 WHERE deleted_at IS NULL
   AND habit_id IS NOT NULL
   AND status IS NOT 'canceled'`;

const UNSCHEDULED_TASKS_SQL = `${TASK_LIST_SELECT}
 WHERE t.deleted_at IS NULL
   AND t.habit_id IS NULL
 ORDER BY t.sort_order ASC, t.updated_at DESC`;

const SCHEDULED_TASKS_SQL = `${TASK_LIST_SELECT}
 WHERE t.deleted_at IS NULL
   AND t.due_date IS NOT NULL
   AND t.due_date != ''
   AND t.habit_id IS NULL
 ORDER BY t.due_date ASC`;

const INBOX_MEETINGS_SQL = `
SELECT id, title, status, number
FROM meetings
WHERE deleted_at IS NULL
ORDER BY updated_at DESC`;

type Props = {
  selectedDay: Date;
  style?: StyleProp<ViewStyle>;
};

export function CalendarDayContextPane({ selectedDay, style }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const selectedYmd = formatLocalYmd(selectedDay);

  const { data: syncedHabits } = useLocalQuery<SyncedHabitMeta>(HABITS_META_SQL);
  const { data: syncedHabitTasks } =
    useLocalQuery<SyncedHabitTask>(HABIT_TASKS_SQL);
  const { data: syncedTasks } =
    useLocalQuery<UnscheduledTaskRow>(UNSCHEDULED_TASKS_SQL);
  const { data: scheduledTasks } =
    useLocalQuery<ScheduledTaskRow>(SCHEDULED_TASKS_SQL);
  const { data: inboxMeetings } =
    useLocalQuery<InboxMeetingRow>(INBOX_MEETINGS_SQL);

  const [habitCheckedOverride, setHabitCheckedOverride] = useState<
    Partial<Record<string, boolean>>
  >({});

  const habitItems = useMemo((): HabitCheckChipItem[] => {
    const habitById = new Map(
      (syncedHabits ?? []).map((habit) => [habit.id, habit] as const),
    );
    return (syncedHabitTasks ?? [])
      .filter(
        (task) =>
          Boolean(task.habit_id) &&
          task.status !== "canceled" &&
          getTaskDueDateYmd(task.due_date) === selectedYmd,
      )
      .map((task) => ({
        habitId: task.habit_id!,
        taskId: task.id,
        title: habitById.get(task.habit_id!)?.title ?? task.title ?? "Habit",
        icon: habitById.get(task.habit_id!)?.icon ?? null,
        checked:
          habitCheckedOverride[task.id] ?? task.status === "completed",
        sortOrder: habitById.get(task.habit_id!)?.sort_order ?? 0,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder: _sortOrder, ...item }) => item);
  }, [habitCheckedOverride, selectedYmd, syncedHabitTasks, syncedHabits]);

  const dueTasks = useMemo(
    () => tasksDueOnCalendarDay(scheduledTasks ?? [], selectedYmd),
    [scheduledTasks, selectedYmd],
  );

  const triageMeetings = useMemo(
    () =>
      (inboxMeetings ?? []).filter((meeting) =>
        meetingBelongsInInbox({ status: meeting.status }),
      ),
    [inboxMeetings],
  );

  const unscheduledTasks = useMemo(
    () => unscheduledCalendarTasks(syncedTasks ?? []),
    [syncedTasks],
  );

  const onToggleHabit = useCallback(
    (item: HabitCheckChipItem, checked: boolean) => {
      setHabitCheckedOverride((current) => ({
        ...current,
        [item.taskId]: checked,
      }));
      void recordHabitDay(client, item.habitId, {
        dueYmd: selectedYmd,
        status: checked ? "completed" : "canceled",
      }).catch(() => {
        setHabitCheckedOverride((current) => {
          const next = { ...current };
          delete next[item.taskId];
          return next;
        });
      });
    },
    [client, selectedYmd],
  );

  const dayLabel = selectedDay.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.heading}>{dayLabel}</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Habits</Text>
        {habitItems.length > 0 ? (
          <TasksTodayHabitsChips
            items={habitItems}
            onToggle={onToggleHabit}
          />
        ) : (
          <Text style={ui.body}>No habits due on this day.</Text>
        )}

        <Text style={[styles.sectionTitle, styles.sectionGap]}>Tasks due</Text>
        {dueTasks.length === 0 ? (
          <Text style={ui.body}>No tasks due on this day.</Text>
        ) : (
          dueTasks.map((task) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => router.push(taskDetailHref(task.id))}
              style={({ pressed }) => [
                styles.taskRow,
                pressed ? styles.taskRowPressed : null,
              ]}
            >
              <TaskStatusIcon status={task.status} size={14} />
              <View style={styles.taskBody}>
                <View style={styles.taskTop}>
                  <Text style={styles.taskMeta}>
                    {getTaskDisplayId(
                      { number: task.number },
                      task.project_key,
                    ) ?? "Task"}
                  </Text>
                  <Text style={styles.taskMeta}>
                    {formatCalendarTaskTime(task.due_date, task.due_end_date)}
                  </Text>
                </View>
                <Text style={styles.taskTitle} numberOfLines={2}>
                  {task.title?.trim() || "Untitled task"}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        {triageMeetings.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>
              Inbox meetings
            </Text>
            {triageMeetings.map((meeting) => (
              <Pressable
                key={meeting.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push(`/meeting/${encodeURIComponent(meeting.id)}`)
                }
                style={({ pressed }) => [
                  styles.taskRow,
                  pressed ? styles.taskRowPressed : null,
                ]}
              >
                <TaskStatusIcon status={meeting.status} size={14} />
                <View style={styles.taskBody}>
                  <Text style={styles.taskMeta}>
                    {formatMeetingDisplayId(meeting.number)}
                  </Text>
                  <Text style={styles.taskTitle} numberOfLines={2}>
                    {meeting.title?.trim() || "Untitled meeting"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}

        <Text style={[styles.sectionTitle, styles.sectionGap]}>
          Unscheduled tasks
        </Text>
        {unscheduledTasks.length === 0 ? (
          <Text style={ui.body}>No open tasks without a due date.</Text>
        ) : (
          unscheduledTasks.map((task) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => router.push(taskDetailHref(task.id))}
              style={({ pressed }) => [
                styles.taskRow,
                pressed ? styles.taskRowPressed : null,
              ]}
            >
              <TaskStatusIcon status={task.status} size={14} />
              <Text style={styles.taskTitle} numberOfLines={2}>
                {task.title?.trim() || "Untitled task"}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    minHeight: 0,
  },
  heading: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.screenX,
    paddingBottom: 8,
  },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.screenX,
    gap: 8,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sectionGap: {
    marginTop: 16,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  taskRowPressed: {
    opacity: 0.7,
  },
  taskBody: {
    flex: 1,
    gap: 2,
  },
  taskTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  taskMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  taskTitle: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
  },
});
