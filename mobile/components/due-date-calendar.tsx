import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  buildDueDateCalendarGrid,
  DUE_DATE_CALENDAR_WEEKDAY_LABELS,
  formatCalendarMonthTitle,
  shiftCalendarMonth,
} from "../lib/due-date-calendar";
import { formatLocalYmd, parseYmdLocal } from "../lib/task-due-date";
import { colors } from "../lib/theme";

export type DueDateCalendarProps = {
  value: string | null | undefined;
  onSelect: (ymd: string) => void;
  disabled?: boolean;
  /** Optional earliest selectable YMD (inclusive). */
  minimumYmd?: string | null;
};

function initialMonthForValue(
  value: string | null | undefined,
  fallback: Date,
): Date {
  const ymd = (value ?? "").trim().slice(0, 10);
  if (ymd) {
    const parsed = parseYmdLocal(ymd);
    if (parsed) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
  }
  return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
}

/**
 * Compact month calendar for due-date pick flows (Monday-start weeks).
 */
export function DueDateCalendar({
  value,
  onSelect,
  disabled = false,
  minimumYmd = null,
}: DueDateCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() =>
    initialMonthForValue(value, today),
  );

  const cells = useMemo(
    () => buildDueDateCalendarGrid(month, value, today),
    [month, today, value],
  );
  const title = formatCalendarMonthTitle(month);
  const todayYmd = formatLocalYmd(today);
  const minYmd = (minimumYmd ?? "").trim().slice(0, 10) || null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={disabled}
          hitSlop={10}
          onPress={() => setMonth((current) => shiftCalendarMonth(current, -1))}
          style={({ pressed }) => [
            styles.nav,
            pressed ? styles.navPressed : null,
          ]}
        >
          <Text style={styles.navLabel}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          disabled={disabled}
          hitSlop={10}
          onPress={() => setMonth((current) => shiftCalendarMonth(current, 1))}
          style={({ pressed }) => [
            styles.nav,
            pressed ? styles.navPressed : null,
          ]}
        >
          <Text style={styles.navLabel}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdays}>
        {DUE_DATE_CALENDAR_WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const beforeMin = minYmd != null && cell.ymd < minYmd;
          const dayDisabled = disabled || beforeMin;
          return (
            <Pressable
              key={cell.ymd}
              accessibilityRole="button"
              accessibilityLabel={cell.ymd}
              accessibilityState={{
                selected: cell.isSelected,
                disabled: dayDisabled,
              }}
              disabled={dayDisabled}
              onPress={() => onSelect(cell.ymd)}
              style={({ pressed }) => [
                styles.dayHit,
                pressed && !dayDisabled ? styles.dayHitPressed : null,
              ]}
            >
              <View
                style={[
                  styles.dayFace,
                  !cell.inCurrentMonth ? styles.dayOutside : null,
                  cell.isToday ? styles.dayToday : null,
                  cell.isSelected ? styles.daySelected : null,
                  beforeMin ? styles.dayDisabled : null,
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    !cell.inCurrentMonth ? styles.dayLabelOutside : null,
                    cell.isSelected ? styles.dayLabelSelected : null,
                    beforeMin ? styles.dayLabelDisabled : null,
                  ]}
                >
                  {cell.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Today"
        disabled={disabled || (minYmd != null && todayYmd < minYmd)}
        onPress={() => {
          onSelect(todayYmd);
          setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        }}
        style={({ pressed }) => [
          styles.todayButton,
          pressed ? styles.todayButtonPressed : null,
        ]}
      >
        <Text style={styles.todayLabel}>Today</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nav: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  navPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  navLabel: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "500",
    lineHeight: 26,
  },
  title: {
    flex: 1,
    textAlign: "center",
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  weekdays: {
    flexDirection: "row",
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayHit: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayHitPressed: {
    opacity: 0.85,
  },
  dayFace: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  dayOutside: {
    opacity: 0.45,
  },
  dayToday: {
    borderColor: "rgba(255,255,255,0.28)",
  },
  daySelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    opacity: 1,
  },
  dayDisabled: {
    opacity: 0.28,
  },
  dayLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 18,
    textAlign: "center",
    includeFontPadding: false,
    ...Platform.select({
      ios: { marginTop: 1 },
      default: { textAlignVertical: "center" as const },
    }),
  },
  dayLabelOutside: {
    color: colors.muted,
  },
  dayLabelSelected: {
    color: "#0b0b0b",
    fontWeight: "700",
  },
  dayLabelDisabled: {
    color: colors.muted,
  },
  todayButton: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  todayButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  todayLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
});
