import { usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import {
  HABIT_TRACKER_ALL_ID,
  habitsSelectedIdFromPathname,
} from "./habits-side-panel";
import { HabitTrackerPane } from "./habit-tracker-pane";
import { useHabitsData } from "../../lib/habits/use-habits-data";
import { colors } from "../../lib/theme";

/**
 * Stable iPad detail host — one HabitTrackerPane instance while switching
 * habits via the side panel (avoids remount flash / re-measure).
 */
export function HabitsDetailHost() {
  const pathname = usePathname();
  const selectedId =
    habitsSelectedIdFromPathname(pathname) ?? HABIT_TRACKER_ALL_ID;
  const data = useHabitsData();
  const habit =
    selectedId === HABIT_TRACKER_ALL_ID
      ? null
      : (data.items.find((item) => item.id === selectedId) ?? null);

  if (selectedId !== HABIT_TRACKER_ALL_ID && !habit) {
    if (data.loading) {
      return <View style={styles.fill} />;
    }
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Habit not found.</Text>
      </View>
    );
  }

  return (
    <HabitTrackerPane
      habit={habit}
      instances={data.instancesForHabit(habit?.id ?? null)}
      todayYmd={data.todayYmd}
      projects={data.projects}
      onTitleChange={
        habit
          ? (title) => {
              void data.onUpdateHabit(habit.id, { title });
            }
          : undefined
      }
      onIconChange={
        habit
          ? (icon) => {
              void data.onUpdateHabit(habit.id, { icon });
            }
          : undefined
      }
      onDescriptionChange={
        habit
          ? (description) => {
              void data.onUpdateHabit(habit.id, { description });
            }
          : undefined
      }
      onCadenceChange={
        habit
          ? (cadence) => {
              void data.onUpdateHabit(habit.id, { cadence });
            }
          : undefined
      }
      onNextDueChange={
        habit
          ? (nextDueYmd) => {
              void data.onUpdateHabit(habit.id, { nextDueYmd });
            }
          : undefined
      }
      onProjectChange={
        habit
          ? (projectId) => {
              void data.onUpdateHabit(habit.id, { projectId });
            }
          : undefined
      }
      onRecordDay={
        habit
          ? async (input) => {
              await data.onRecordDay(habit.id, input);
            }
          : undefined
      }
      onDeleteDay={
        habit
          ? async ({ taskId }) => {
              await data.onDeleteDay(taskId);
            }
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
  },
});
