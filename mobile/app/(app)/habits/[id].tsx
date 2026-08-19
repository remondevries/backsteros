import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HABIT_TRACKER_ALL_ID } from "../../../components/habits/habits-side-panel";
import { HabitDetailNavHeader } from "../../../components/habits/habits-header";
import { HabitTrackerPane } from "../../../components/habits/habit-tracker-pane";
import { isPadDevice } from "../../../lib/device";
import { useHabitsData } from "../../../lib/habits/use-habits-data";
import { colors } from "../../../lib/theme";

/**
 * Phone: habit tracker (single habit or All). iPad: URL stub — detail is HabitsDetailHost.
 */
export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habitId = typeof id === "string" ? id : id?.[0];
  const data = useHabitsData();
  const isPad = isPadDevice();
  const navigation = useNavigation();
  const router = useRouter();
  const isAll = !habitId || habitId === HABIT_TRACKER_ALL_ID;
  const habit = isAll
    ? null
    : (data.items.find((item) => item.id === habitId) ?? null);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.replace("/habits");
  }, [navigation, router]);

  if (isPad) {
    return <View style={styles.padRouteStub} />;
  }

  // Shared provider keeps list data warm — don't gate on a spinner. Only
  // "not found" after load settles; cold deep-links get back chrome only.
  if (!isAll && !habit) {
    if (data.loading) {
      const year =
        Number(data.todayYmd.slice(0, 4)) || new Date().getFullYear();
      return (
        <View style={styles.phone}>
          <HabitDetailNavHeader
            year={year}
            maxYear={year + 25}
            onYearChange={() => {}}
            onBack={handleBack}
          />
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Habit not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.phone}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  phone: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padRouteStub: {
    flex: 1,
    backgroundColor: "transparent",
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
