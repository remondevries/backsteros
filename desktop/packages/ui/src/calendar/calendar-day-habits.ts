import { getTaskDueDateYmd } from "../tasks/tasks-due-filters.js";
import type { CalendarHabitIconItem } from "../components/calendar/calendar-habits-icon-row.js";

export type CalendarHabitDefinition = {
  id: string;
  title: string;
  icon: string | null;
  sortOrder?: number;
};

export type CalendarHabitDayTask = {
  id: string;
  habitId?: string | null;
  title?: string;
  dueDate: string | number | Date | null | undefined;
  status: string;
};

/** Group habit day tasks by due calendar date for per-day calendar chips. */
export function buildCalendarDayHabitsByDate(
  habits: readonly CalendarHabitDefinition[],
  tasks: readonly CalendarHabitDayTask[],
): ReadonlyMap<string, readonly CalendarHabitIconItem[]> {
  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const byDate = new Map<string, CalendarHabitIconItem[]>();

  for (const task of tasks) {
    const habitId = task.habitId?.trim();
    if (!habitId) continue;
    if (task.status === "canceled") continue;
    const habit = habitById.get(habitId);
    if (!habit) continue;
    const ymd = getTaskDueDateYmd(task.dueDate);
    if (!ymd) continue;

    const list = byDate.get(ymd) ?? [];
    list.push({
      habitId: habit.id,
      taskId: task.id,
      title: habit.title,
      icon: habit.icon,
      completed: task.status === "completed",
      sortOrder: habit.sortOrder ?? 0,
    });
    byDate.set(ymd, list);
  }

  for (const [ymd, list] of byDate) {
    list.sort((a, b) => {
      const aOrder = a.sortOrder ?? 0;
      const bOrder = b.sortOrder ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
    byDate.set(
      ymd,
      list.map(({ sortOrder: _sortOrder, ...item }) => item),
    );
  }

  return byDate;
}
