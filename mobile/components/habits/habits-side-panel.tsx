import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { isPadDevice } from "../../lib/device";
import { fireHabitCompleteConfetti } from "../../lib/habits/habit-complete-confetti";
import type { HabitListItem } from "../../lib/habits/use-habits-data";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { normalizePathname } from "../../lib/use-escape-back-navigation";
import { ProjectOcticon } from "../project-octicon";

export const HABIT_TRACKER_ALL_ID = "all";

const isPad = isPadDevice();
const SCROLL_BOTTOM_PAD = isPad ? 24 : FLOATING_TAB_BAR_CLEARANCE;

export function habitsSelectedIdFromPathname(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  if (normalized === "/habits" || normalized === "/habits/") {
    return HABIT_TRACKER_ALL_ID;
  }
  const match = normalized.match(/^\/habits\/([^/]+)$/);
  if (!match?.[1] || match[1] === "all") return HABIT_TRACKER_ALL_ID;
  return match[1];
}

type Props = {
  items: HabitListItem[];
  loading?: boolean;
  error?: string | null;
  pullRefreshing?: boolean;
  onRefresh?: () => void;
  onCreateHabit?: (input: { title: string; icon: string | null }) => Promise<void>;
  onToggleToday?: (habit: HabitListItem, checked: boolean) => void;
  autoSelectFirst?: boolean;
  /** When true, show the inline title field (header + opens this). */
  adding?: boolean;
  onAddingChange?: (adding: boolean) => void;
};

function HabitRow({
  habit,
  selected,
  inactive = false,
  onPress,
  onToggle,
}: {
  habit: HabitListItem;
  selected: boolean;
  inactive?: boolean;
  onPress: () => void;
  onToggle?: () => void;
}) {
  const checkRef = useRef<View>(null);
  const canToggle = Boolean(onToggle && !inactive && habit.todayTaskId);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : null,
        pressed ? styles.rowPressed : null,
        inactive ? styles.rowInactive : null,
      ]}
    >
      <View style={styles.rowIcon} pointerEvents="none">
        <ProjectOcticon icon={habit.icon} size={16} color={colors.muted} />
      </View>
      <Text
        style={[styles.rowLabel, inactive ? styles.rowLabelInactive : null]}
        numberOfLines={1}
      >
        {habit.title}
      </Text>
      {canToggle ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: habit.checked }}
          accessibilityLabel={`Mark ${habit.title} complete`}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation?.();
            const nextChecked = !habit.checked;
            if (nextChecked) {
              checkRef.current?.measureInWindow((x, y, width, height) => {
                fireHabitCompleteConfetti({
                  x: x + width / 2,
                  y: y + height / 2,
                });
              });
            }
            onToggle?.();
          }}
          style={styles.checkHit}
        >
          <View
            ref={checkRef}
            collapsable={false}
            style={[styles.check, habit.checked ? styles.checkOn : null]}
          >
            {habit.checked ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function HabitsSidePanel({
  items,
  loading = false,
  error = null,
  pullRefreshing = false,
  onRefresh,
  onCreateHabit,
  onToggleToday,
  autoSelectFirst = false,
  adding: addingProp,
  onAddingChange,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = habitsSelectedIdFromPathname(pathname) ?? HABIT_TRACKER_ALL_ID;
  const [addingInternal, setAddingInternal] = useState(false);
  const adding = addingProp ?? addingInternal;
  const setAdding = onAddingChange ?? setAddingInternal;
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [inactiveCollapsed, setInactiveCollapsed] = useState(false);

  const { openHabits, completedHabits, inactiveHabits } = useMemo(() => {
    const open: HabitListItem[] = [];
    const completed: HabitListItem[] = [];
    const inactive: HabitListItem[] = [];
    for (const habit of items) {
      if (!habit.todayTaskId) {
        inactive.push(habit);
        continue;
      }
      if (habit.checked) completed.push(habit);
      else open.push(habit);
    }
    return {
      openHabits: open,
      completedHabits: completed,
      inactiveHabits: inactive,
    };
  }, [items]);

  useEffect(() => {
    if (!autoSelectFirst || !isPadDevice()) return;
    if (selectedId !== HABIT_TRACKER_ALL_ID) return;
    // Keep All selected by default (desktop parity).
  }, [autoSelectFirst, selectedId]);

  const goAll = useCallback(() => {
    // Phone: open the aggregated tracker (same as a habit row → detail).
    // iPad: `/habits/all` still resolves to All in HabitsDetailHost.
    router.push("/habits/all");
  }, [router]);

  const goHabit = useCallback(
    (id: string) => {
      router.push(`/habits/${id}`);
    },
    [router],
  );

  async function submitNew() {
    const next = title.trim();
    if (!next || !onCreateHabit || submitting) return;
    setSubmitting(true);
    try {
      await onCreateHabit({ title: next, icon: null });
      setTitle("");
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.muted}
            />
          ) : undefined
        }
      >
        {adding ? (
          <View style={styles.compose}>
            <TextInput
              autoFocus
              value={title}
              onChangeText={setTitle}
              placeholder="Habit title"
              placeholderTextColor={colors.muted}
              style={styles.composeInput}
              onSubmitEditing={() => {
                void submitNew();
              }}
              returnKeyType="done"
            />
            <Pressable
              onPress={() => {
                void submitNew();
              }}
              disabled={!title.trim() || submitting}
              style={styles.composeSubmit}
            >
              <Text style={styles.composeSubmitLabel}>Add</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={ui.error}>{error}</Text> : null}
        {loading && items.length === 0 ? (
          <ActivityIndicator color={colors.muted} style={{ marginTop: 24 }} />
        ) : null}

        <Pressable
          onPress={goAll}
          style={({ pressed }) => [
            styles.row,
            selectedId === HABIT_TRACKER_ALL_ID ? styles.rowSelected : null,
            pressed ? styles.rowPressed : null,
          ]}
        >
          <Text style={styles.rowLabel}>All</Text>
        </Pressable>

        {openHabits.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            selected={selectedId === habit.id}
            onPress={() => goHabit(habit.id)}
            onToggle={
              onToggleToday
                ? () => onToggleToday(habit, !habit.checked)
                : undefined
            }
          />
        ))}

        {completedHabits.length > 0 ? (
          <View style={styles.group}>
            <Pressable
              onPress={() => setCompletedCollapsed((value) => !value)}
              style={styles.groupHeader}
            >
              <Text style={styles.groupTitle}>Completed</Text>
              <Text style={styles.groupChevron}>
                {completedCollapsed ? "›" : "‹"}
              </Text>
            </Pressable>
            {!completedCollapsed
              ? completedHabits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    selected={selectedId === habit.id}
                    onPress={() => goHabit(habit.id)}
                    onToggle={
                      onToggleToday
                        ? () => onToggleToday(habit, !habit.checked)
                        : undefined
                    }
                  />
                ))
              : null}
          </View>
        ) : null}

        {inactiveHabits.length > 0 ? (
          <View style={styles.group}>
            <Pressable
              onPress={() => setInactiveCollapsed((value) => !value)}
              style={styles.groupHeader}
            >
              <Text style={styles.groupTitle}>Inactive for today</Text>
              <Text style={styles.groupChevron}>
                {inactiveCollapsed ? "›" : "‹"}
              </Text>
            </Pressable>
            {!inactiveCollapsed
              ? inactiveHabits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    inactive
                    selected={selectedId === habit.id}
                    onPress={() => goHabit(habit.id)}
                  />
                ))
              : null}
          </View>
        ) : null}

        {!loading && items.length === 0 ? (
          <Text style={ui.empty}>No habits yet. Tap + to add one.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingBottom: SCROLL_BOTTOM_PAD,
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  rowSelected: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  rowPressed: {
    backgroundColor: colors.rowPressed,
  },
  rowIcon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  rowInactive: {
    opacity: 0.72,
  },
  rowLabelInactive: {
    color: colors.muted,
  },
  checkHit: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: "#3d9a5b",
    borderColor: "#3d9a5b",
  },
  checkMark: {
    color: "#000",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
  group: {
    marginTop: 10,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  groupChevron: {
    color: colors.muted,
    fontSize: 14,
  },
  compose: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: spacing.screenX - 8,
  },
  composeInput: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.foreground,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  composeSubmit: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  composeSubmitLabel: {
    color: colors.foreground,
    fontWeight: "600",
    fontSize: 14,
  },
});
