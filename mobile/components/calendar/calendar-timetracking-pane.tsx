import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  collectTimetrackingEntries,
  formatTimetrackingDuration,
  sumTimetrackingDurationSeconds,
  withLiveTimetrackingEntries,
  type TimetrackingEntry,
} from "../../lib/calendar/calendar-timetracking-entries";
import {
  buildTimetrackingDayGroups,
  formatTimetrackingPeriodLabel,
  periodForMonthKey,
  periodForWeekKey,
  periodForYmd,
  todayYmd,
  type TimetrackingPeriod,
} from "../../lib/calendar/calendar-timetracking-days";
import { formatMeetingDisplayId } from "../../lib/meeting-display-id";
import { formatTaskDisplayId, INBOX_TASK_KEY } from "../../lib/task-display-id";
import { useTrackedTimerOptional } from "../../lib/tracked-timer/tracked-timer-context";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useLocalQuery } from "../../lib/use-local-query";
import { SegmentedPillToggle } from "../segmented-pill-toggle";

type TimetrackingTaskRow = {
  id: string;
  title: string | null;
  number: number | null;
  tracked_duration_seconds: number | null;
  due_date: string | null;
};

type TimetrackingMeetingRow = {
  id: string;
  title: string | null;
  number: number | null;
  tracked_duration_seconds: number | null;
  start_at: string | null;
};

const TASKS_SQL = `
SELECT id, title, number, tracked_duration_seconds, due_date
FROM tasks
WHERE deleted_at IS NULL
  AND tracked_duration_seconds IS NOT NULL
  AND tracked_duration_seconds > 0`;

const MEETINGS_SQL = `
SELECT id, title, number, tracked_duration_seconds, start_at
FROM meetings
WHERE deleted_at IS NULL
  AND tracked_duration_seconds IS NOT NULL
  AND tracked_duration_seconds > 0`;

type PeriodKind = "day" | "week" | "month";

const PERIOD_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

type Props = {
  selectedDay: Date;
};

export function CalendarTimetrackingPane({ selectedDay }: Props) {
  const router = useRouter();
  const timer = useTrackedTimerOptional();
  const [periodKind, setPeriodKind] = useState<PeriodKind>("week");

  const { data: taskRows, isLoading: tasksLoading } =
    useLocalQuery<TimetrackingTaskRow>(TASKS_SQL);
  const { data: meetingRows, isLoading: meetingsLoading } =
    useLocalQuery<TimetrackingMeetingRow>(MEETINGS_SQL);

  const selectedYmd = todayYmd(selectedDay);

  const period = useMemo((): TimetrackingPeriod => {
    if (periodKind === "day") return periodForYmd(selectedYmd);
    if (periodKind === "month") {
      const monthKey = selectedYmd.slice(0, 7);
      return periodForMonthKey(monthKey) ?? periodForYmd(selectedYmd);
    }
    const weekKey = buildTimetrackingDayGroups({ endYmd: selectedYmd, monthsBack: 1 })
      .flatMap((month) => month.weeks)
      .find((week) => week.days.some((day) => day.ymd === selectedYmd))?.weekKey;
    return weekKey
      ? periodForWeekKey(weekKey)
      : periodForYmd(selectedYmd);
  }, [periodKind, selectedYmd]);

  const entries = useMemo(() => {
    const base = collectTimetrackingEntries({
      tasks: taskRows.map((row) => ({
        id: row.id,
        title: row.title?.trim() || "Untitled task",
        number: row.number,
        displayId: row.number
          ? formatTaskDisplayId(INBOX_TASK_KEY, row.number)
          : null,
        trackedDurationSeconds: row.tracked_duration_seconds,
        scheduleAt: row.due_date,
      })),
      meetings: meetingRows.map((row) => ({
        id: row.id,
        title: row.title?.trim() || "Untitled meeting",
        number: row.number,
        displayId: formatMeetingDisplayId(row.number),
        trackedDurationSeconds: row.tracked_duration_seconds,
        scheduleAt: row.start_at,
      })),
      period,
      taskHref: (id) => `/task/${id}`,
      meetingHref: (id) => `/meeting/${id}`,
    });
    const liveSources = (timer?.recentTimers ?? [])
      .filter((entry) => entry.isRunning)
      .map((entry) => ({
        id: entry.entityId,
        kind: entry.kind,
        title: entry.title,
        displayId: entry.subtitle,
        href: entry.href,
        trackedDurationSeconds: entry.elapsedSeconds,
      }));
    return withLiveTimetrackingEntries(base, liveSources);
  }, [meetingRows, period, taskRows, timer?.recentTimers, timer?.timerTick]);

  const totalSeconds = sumTimetrackingDurationSeconds(entries);

  const openEntry = (entry: TimetrackingEntry) => {
    router.push(entry.href as `/task/${string}` | `/meeting/${string}`);
  };

  if (tasksLoading || meetingsLoading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.periodToggleShell}>
          <SegmentedPillToggle
            accessibilityLabel="Timetracking period"
            value={periodKind}
            onChange={setPeriodKind}
            options={PERIOD_OPTIONS}
            fullWidth
          />
        </View>
        <Text style={styles.periodLabel}>
          {formatTimetrackingPeriodLabel(period)}
        </Text>
        <Text style={styles.totalLabel}>
          Total {formatTimetrackingDuration(totalSeconds)}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {entries.length === 0 ? (
          <Text style={[ui.body, { color: colors.muted }]}>
            No tracked time in this period.
          </Text>
        ) : (
          entries.map((entry) => (
            <Pressable
              key={`${entry.kind}:${entry.id}`}
              accessibilityRole="button"
              onPress={() => openEntry(entry)}
              style={({ pressed }) => [
                styles.row,
                entry.isLive ? styles.rowLive : null,
                pressed ? styles.rowPressed : null,
              ]}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {entry.title}
                </Text>
                {entry.displayId ? (
                  <Text style={styles.rowMeta}>{entry.displayId}</Text>
                ) : null}
              </View>
              <Text
                style={[styles.duration, entry.isLive ? styles.durationLive : null]}
              >
                {formatTimetrackingDuration(entry.trackedDurationSeconds)}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  periodToggleShell: {
    alignSelf: "stretch",
    padding: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowLive: {
    borderColor: "#52a450",
  },
  rowPressed: {
    opacity: 0.8,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  duration: {
    color: colors.foreground,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  durationLive: {
    color: "#52a450",
  },
});
