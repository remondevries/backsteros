import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";

import {
  HabitTrackerView,
  getTaskDueDateYmd,
  getTodayJournalDateSlug,
  type HabitGridInstance,
} from "@backsteros/ui";

import { useDesktopWorkspaceData } from "../lib/workspace-data";

export function HabitTrackerPage() {
  const { habitId } = useParams<{ habitId?: string }>();
  const workspace = useDesktopWorkspaceData();
  const todayYmd = getTodayJournalDateSlug();
  const habit = habitId
    ? (workspace.habits.find((entry) => entry.id === habitId) ?? null)
    : null;

  const habitTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of workspace.habits) {
      map.set(entry.id, entry.title);
    }
    return map;
  }, [workspace.habits]);

  const projects = useMemo(
    () =>
      workspace.projects.map((project) => ({
        id: project.id,
        name: project.name,
        icon: project.icon,
        type: project.type,
      })),
    [workspace.projects],
  );

  useEffect(() => {
    void workspace.reloadHabits().catch(() => {
      // Side panel still shows whatever we already have.
    });
  }, [workspace.reloadHabits]);

  const instances: HabitGridInstance[] = useMemo(() => {
    return workspace.allTasks.flatMap((task) => {
      if (!task.habitId) return [];
      if (habit && task.habitId !== habit.id) return [];
      const dueYmd = getTaskDueDateYmd(task.dueDate);
      if (!dueYmd) return [];
      return [
        {
          dueYmd,
          status: task.status,
          taskId: task.id,
          title: habitTitleById.get(task.habitId) ?? task.title ?? "Habit",
        },
      ];
    });
  }, [habit, habitTitleById, workspace.allTasks]);

  return (
    <HabitTrackerView
      habit={habit}
      instances={instances}
      todayYmd={todayYmd}
      projects={projects}
      onCadenceChange={
        habit
          ? (cadence) => {
              void workspace.updateHabit(habit.id, { cadence });
            }
          : undefined
      }
      onProjectChange={
        habit
          ? (projectId) => {
              void workspace.updateHabit(habit.id, { projectId });
            }
          : undefined
      }
      onIconChange={
        habit
          ? (icon) => {
              void workspace.updateHabit(habit.id, { icon });
            }
          : undefined
      }
      onTitleChange={
        habit
          ? async (title) => {
              try {
                await workspace.updateHabit(habit.id, { title });
                return { ok: true as const };
              } catch (error) {
                return {
                  ok: false as const,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Could not rename habit.",
                };
              }
            }
          : undefined
      }
      onDescriptionChange={
        habit
          ? (description) => {
              void workspace.updateHabit(habit.id, { description });
            }
          : undefined
      }
      onNextDueChange={
        habit
          ? (nextDueYmd) => {
              void workspace.updateHabit(habit.id, { nextDueYmd });
            }
          : undefined
      }
      onRecordDay={
        habit
          ? async ({ dueYmd, status }) => {
              await workspace.recordHabitDay(habit.id, { dueYmd, status });
            }
          : undefined
      }
      onDeleteDay={
        habit
          ? async ({ taskId }) => {
              await workspace.softDeleteTask(taskId);
            }
          : undefined
      }
    />
  );
}
