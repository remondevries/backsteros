import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fireHabitCompleteConfetti } from "../lib/habits/habit-complete-confetti";
import { colors } from "../lib/theme";

export function collapseHabitItemsByHabitId<
  T extends { habitId: string; checked: boolean; title?: string },
>(items: readonly T[]): T[] {
  const byHabit = new Map<string, T>();
  for (const item of items) {
    const existing = byHabit.get(item.habitId);
    if (!existing) {
      byHabit.set(item.habitId, item);
      continue;
    }
    if (item.checked && !existing.checked) {
      byHabit.set(item.habitId, item);
    }
  }
  const byTitle = new Map<string, T>();
  for (const item of byHabit.values()) {
    const titleKey = (item.title ?? "").trim().toLowerCase() || item.habitId;
    const existing = byTitle.get(titleKey);
    if (!existing) {
      byTitle.set(titleKey, item);
      continue;
    }
    if (item.checked && !existing.checked) {
      byTitle.set(titleKey, item);
    }
  }
  return [...byTitle.values()];
}

export type HabitCheckChipItem = {
  habitId: string;
  taskId: string;
  title: string;
  icon: string | null;
  checked: boolean;
};

type Props = {
  items: readonly HabitCheckChipItem[];
  onToggle?: (item: HabitCheckChipItem, checked: boolean) => void;
  /** Accessible name for the chip group. */
  accessibilityLabel?: string;
};

function HabitChip({
  item,
  onToggle,
}: {
  item: HabitCheckChipItem;
  onToggle?: (item: HabitCheckChipItem, checked: boolean) => void;
}) {
  const originRef = useRef<View>(null);
  const canToggle = Boolean(onToggle);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.checked, disabled: !canToggle }}
      accessibilityLabel={`Mark ${item.title} complete`}
      disabled={!canToggle}
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
      style={({ pressed }) => [
        styles.chip,
        item.checked ? styles.chipChecked : null,
        pressed && canToggle ? styles.chipPressed : null,
      ]}
    >
      <View ref={originRef} collapsable={false} style={styles.chipInner}>
        <View style={[styles.check, item.checked ? styles.checkOn : null]}>
          {item.checked ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text
          numberOfLines={1}
          style={[styles.title, item.checked ? styles.titleChecked : null]}
        >
          {item.title}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Dashed habit check chips — checkbox + title only, whole chip toggles.
 * Used on Tasks → Today (journal Habits uses the list rows instead).
 */
export function HabitCheckChips({
  items,
  onToggle,
  accessibilityLabel = "Habits",
}: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.list} accessibilityLabel={accessibilityLabel}>
      {items.map((item) => (
        <HabitChip key={item.taskId} item={item} onToggle={onToggle} />
      ))}
    </View>
  );
}

/** Tasks overview header wrapper for today's habit chips (above Triage). */
export function TasksTodayHabitsChips({ items, onToggle }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.root} accessibilityLabel="Today's habits">
      <HabitCheckChips
        items={items}
        onToggle={onToggle}
        accessibilityLabel="Today's habits"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    maxWidth: "100%",
    minHeight: 32,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: 6,
    overflow: "hidden",
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 12,
  },
  chipPressed: {
    backgroundColor: colors.rowPressed,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  chipChecked: {
    opacity: 0.55,
  },
  check: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkMark: {
    color: colors.background,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
  title: {
    maxWidth: 160,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  titleChecked: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
});
