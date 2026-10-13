import { getTaskDueDateYmd } from "../tasks/task-due-date.js";
import { collapseHabitItemsByHabitId } from "../components/tasks/tasks-today-habits-chips.js";
import type { JournalHabitDayItem } from "../components/journal/journal-habits-section.js";

/** Habit day instances are synced as tasks but shown separately on journal days. */
export function isHabitLinkedTask(task: {
  habitId?: string | null;
}): boolean {
  return Boolean(task.habitId && String(task.habitId).trim());
}

export type JournalDayHabitMeta = {
  id: string;
  title?: string | null;
  icon?: string | null;
  sortOrder?: number | null;
};

export type JournalDayTaskLike = {
  id: string;
  title?: string | null;
  dueDate?: Date | number | string | null;
  status?: string | null;
  habitId?: string | null;
};

export type JournalDayTaskModel<T extends JournalDayTaskLike> = {
  /** Non-habit tasks due on the journal date. */
  dueTasks: T[];
  /** Habit-linked tasks due on the journal date (for timeline icons). */
  dayHabitTasks: T[];
  /** All tasks due on the journal date (due + habit), for day timeline. */
  dayTasks: T[];
  /** Collapsed, sorted habit checklist rows for the Habits tab. */
  habitItems: JournalHabitDayItem[];
};

/**
 * One pass over workspace tasks for a journal day: due list, habit items with
 * lifetime outcome counts, and the combined day task list for the timeline.
 */
export function buildJournalDayTaskModel<T extends JournalDayTaskLike>(
  allTasks: readonly T[],
  habits: readonly JournalDayHabitMeta[],
  dateSlug: string,
  calendarTimeZone?: string,
): JournalDayTaskModel<T> {
  const habitById = new Map(
    habits.map((habit) => [habit.id, habit] as const),
  );
  const outcomeByHabitId = new Map<
    string,
    { completedCount: number; missedCount: number }
  >();

  const dueTasks: T[] = [];
  const dayHabitTasks: T[] = [];
  const habitRows: Array<JournalHabitDayItem & { sortOrder: number }> = [];

  for (const task of allTasks) {
    const habitId = task.habitId?.trim() || null;
    if (habitId) {
      let outcomes = outcomeByHabitId.get(habitId);
      if (!outcomes) {
        outcomes = { completedCount: 0, missedCount: 0 };
        outcomeByHabitId.set(habitId, outcomes);
      }
      if (task.status === "completed") outcomes.completedCount += 1;
      else if (task.status === "canceled") outcomes.missedCount += 1;
    }

    if (getTaskDueDateYmd(task.dueDate, calendarTimeZone) !== dateSlug) {
      continue;
    }

    if (isHabitLinkedTask(task) && habitId) {
      dayHabitTasks.push(task);
      const habit = habitById.get(habitId);
      habitRows.push({
        habitId,
        taskId: task.id,
        title: habit?.title ?? task.title ?? "Habit",
        icon: habit?.icon ?? null,
        checked: task.status === "completed",
        completedCount: 0,
        missedCount: 0,
        sortOrder: habit?.sortOrder ?? 0,
      });
    } else if (!isHabitLinkedTask(task)) {
      dueTasks.push(task);
    }
  }

  for (const row of habitRows) {
    const outcomes = outcomeByHabitId.get(row.habitId);
    if (!outcomes) continue;
    row.completedCount = outcomes.completedCount;
    row.missedCount = outcomes.missedCount;
  }

  habitRows.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  const habitItems = collapseHabitItemsByHabitId(
    habitRows.map(({ sortOrder: _sortOrder, ...item }) => item),
  );

  return {
    dueTasks,
    dayHabitTasks,
    dayTasks: [...dueTasks, ...dayHabitTasks],
    habitItems,
  };
}
