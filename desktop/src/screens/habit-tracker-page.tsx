import { useMemo } from "react";

import {
  HabitTrackerView,
  getTaskDueDateYmd,
  getTodayJournalDateSlug,
  type HabitGridInstance,
} from "@backsteros/ui";

import { writeHabitGridInstances } from "../lib/habit-instances-cache";
import { useShellParams } from "../lib/shell-route-keep-alive";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceMeta,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";

export function HabitTrackerPage() {
  const { habitId } = useShellParams() as { habitId?: string };
  return <HabitTrackerPageLive habitId={habitId} />;
}

function HabitTrackerPageLive({ habitId }: { habitId?: string }) {
  const { habits } = useDesktopWorkspaceMeta();
  const { allTasks } = useDesktopWorkspaceTasks();
  const { projects: workspaceProjects } = useDesktopWorkspaceProjects();
  const workspace = useDesktopWorkspaceActions();
  const todayYmd = getTodayJournalDateSlug();
  const habit = habitId
    ? (habits.find((entry) => entry.id === habitId) ?? null)
    : null;

  const habitTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of habits) {
      map.set(entry.id, entry.title);
    }
    return map;
  }, [habits]);

  const projects = useMemo(
    () =>
      workspaceProjects.map((project) => ({
        id: project.id,
        name: project.name,
        icon: project.icon,
        type: project.type,
      })),
    [workspaceProjects],
  );

  const instances: HabitGridInstance[] = useMemo(() => {
    const next = allTasks.flatMap((task) => {
      if (!task.habitId) return [];
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
    writeHabitGridInstances(next);
    if (!habit) return next;
    const habitTitle = habit.title;
    return next.filter((entry) => entry.title === habitTitle);
  }, [allTasks, habit, habitTitleById]);

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
