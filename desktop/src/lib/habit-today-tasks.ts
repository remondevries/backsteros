import type { Habit } from "@backsteros/contracts";
import {
  getTaskDueDateYmd,
  getTodayJournalDateSlug,
  type HabitListItem,
} from "@backsteros/ui";

import { habitPanelItemsFromHabits } from "./habit-instances-cache";

export type HabitTodayTaskSource = {
  id: string;
  habitId?: string | null;
  dueDate?: string | number | Date | null;
  status: string;
};

export type HabitWithTodayTask = HabitListItem & {
  todayTaskStatus: string | null;
};

/**
 * Attach each habit's task due today (O(habits×tasks)).
 * When `enabled` is false, skip the walk and return `fallback` (or the
 * habit-panel cache / null today fields).
 */
export function habitsWithTodayTasks(
  habits: readonly Habit[],
  allTasks: readonly HabitTodayTaskSource[],
  options: {
    enabled: boolean;
    todayYmd?: string;
    fallback?: HabitWithTodayTask[];
  },
): HabitWithTodayTask[] {
  if (!options.enabled) {
    if (options.fallback) return options.fallback;
    return habitPanelItemsFromHabits(habits).map((habit) => ({
      ...habit,
      todayTaskStatus: null,
    }));
  }

  const todayYmd = options.todayYmd ?? getTodayJournalDateSlug();
  return habits.map((habit) => {
    const todayTask = allTasks.find((task) => {
      if (task.habitId !== habit.id) return false;
      return getTaskDueDateYmd(task.dueDate) === todayYmd;
    });
    return {
      ...habit,
      todayTaskId: todayTask?.id ?? null,
      todayTaskStatus: todayTask?.status ?? null,
      checked: todayTask?.status === "completed",
    };
  });
}
