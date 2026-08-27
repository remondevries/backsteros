import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatLocalYmd } from "../../lib/task-due-date";
import { colors, spacing } from "../../lib/theme";

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(left: Date, right: Date): boolean {
  return formatLocalYmd(left) === formatLocalYmd(right);
}

type Props = {
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarWeekStrip({
  selectedDay,
  onSelectDay,
}: Props) {
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const weekStart = useMemo(
    () => startOfWeekMonday(selectedDay),
    [selectedDay],
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {days.map((day, index) => {
          const selected = isSameDay(day, selectedDay);
          const isToday = isSameDay(day, today);
          return (
            <Pressable
              key={formatLocalYmd(day)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelectDay(day)}
              style={[
                styles.dayCell,
                selected ? styles.dayCellSelected : null,
                isToday && !selected ? styles.dayCellToday : null,
              ]}
            >
              <Text
                style={[
                  styles.weekday,
                  selected ? styles.dayTextSelected : null,
                ]}
              >
                {WEEKDAY_LABELS[index]}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  selected ? styles.dayTextSelected : null,
                ]}
              >
                {day.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: 8,
  },
  strip: {
    gap: 6,
    paddingVertical: 2,
  },
  dayCell: {
    width: 44,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
  },
  dayCellSelected: {
    backgroundColor: colors.foreground,
  },
  dayCellToday: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  weekday: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  dayNumber: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 2,
  },
  dayTextSelected: {
    color: colors.background,
  },
});
