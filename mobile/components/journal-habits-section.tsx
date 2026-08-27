import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fireHabitCompleteConfetti } from "../lib/habits/habit-complete-confetti";
import { colors } from "../lib/theme";
import { ProjectOcticon } from "./project-octicon";

export type JournalHabitDayItem = {
  habitId: string;
  taskId: string;
  title: string;
  icon: string | null;
  checked: boolean;
  completedCount: number;
  missedCount: number;
};

type Props = {
  items: readonly JournalHabitDayItem[];
  onToggle?: (item: JournalHabitDayItem, checked: boolean) => void;
};

function HabitRow({
  item,
  onToggle,
  showDivider,
}: {
  item: JournalHabitDayItem;
  onToggle?: (item: JournalHabitDayItem, checked: boolean) => void;
  showDivider: boolean;
}) {
  const originRef = useRef<View>(null);
  const canToggle = Boolean(onToggle);

  return (
    <View
      style={[styles.row, showDivider ? styles.rowDivider : null]}
      accessibilityLabel={item.title}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked, disabled: !canToggle }}
        accessibilityLabel={`Mark ${item.title} complete`}
        disabled={!canToggle}
        hitSlop={8}
        onPress={() => {
          if (!canToggle) return;
          const next = !item.checked;
          if (next) {
            originRef.current?.measureInWindow((x, y, width, height) => {
              fireHabitCompleteConfetti({
                x: x + width / 2,
                y: y + height / 2,
              });
            });
          }
          onToggle?.(item, next);
        }}
        style={styles.iconHit}
      >
        <View ref={originRef} collapsable={false} style={styles.icon}>
          <ProjectOcticon
            icon={item.icon}
            size={16}
            color={item.checked ? HABIT_DONE_COLOR : colors.foreground}
          />
        </View>
      </Pressable>
      <Text
        numberOfLines={1}
        style={[styles.title, item.checked ? styles.titleChecked : null]}
      >
        {item.title}
      </Text>
      <Text style={styles.counts}>
        {item.completedCount} completed · {item.missedCount} missed
      </Text>
    </View>
  );
}

/** Journal Habits tab — icon toggle, title, and outcome counts. */
export function JournalHabitsList({ items, onToggle }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.root} accessibilityLabel="Habits">
      {items.map((item, index) => (
        <HabitRow
          key={item.taskId}
          item={item}
          onToggle={onToggle}
          showDivider={index < items.length - 1}
        />
      ))}
    </View>
  );
}

/** Count completed / missed habit day tasks for one habit definition. */
export function countHabitDayOutcomes(
  tasks: readonly { habit_id?: string | null; status?: string | null }[],
  habitId: string,
): { completedCount: number; missedCount: number } {
  let completedCount = 0;
  let missedCount = 0;
  for (const task of tasks) {
    if (task.habit_id !== habitId) continue;
    if (task.status === "completed") completedCount += 1;
    else if (task.status === "canceled") missedCount += 1;
  }
  return { completedCount, missedCount };
}

const HABIT_DONE_COLOR = "#3d9a5b";

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingVertical: 8,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconHit: {
    padding: 2,
  },
  icon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 15,
  },
  titleChecked: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  counts: {
    flexShrink: 0,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
});
