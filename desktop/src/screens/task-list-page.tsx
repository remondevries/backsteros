import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  TasksListSkeleton,
  TasksOverviewView,
  TASKS_LIST_BOARD_STORAGE_KEY,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  buildTasksDueHref,
  computeTaskDisplayIdColumnCh,
  getDefaultDueDateYmdForTasksDueFilter,
  getInboxTaskRouteSlugForTask,
  getTaskDueDateYmd,
  getTodayJournalDateSlug,
  isHabitLinkedTask,
  parseListBoardViewFromLocation,
  parseTasksDueFilterFromLocation,
  parseYmdLocal,
  persistListBoardView,
  primeTabTitle,
  taskReorderPatches,
  collapseHabitItemsByHabitId,
  type HabitCheckChipItem,
} from "@backsteros/ui";

import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import {
  isTaskAgentWorkingForUi,
  renderTaskAgentTitleTrailing,
} from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export function TaskListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();

  useDesktopSectionBreadcrumb([{ label: "Tasks" }]);

  useEffect(() => {
    void workspace.reloadHabits().catch(() => {
      // Chips still render from whatever tasks we already have.
    });
  }, [workspace.reloadHabits]);

  const dueFilter =
    parseTasksDueFilterFromLocation(location.pathname, location.search) ??
    undefined;

  const view = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.search,
        TASKS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.search],
  );

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );

  const projectOptions = useMemo(
    () => buildProjectDropdownOptions(workspace.projects),
    [workspace.projects],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(workspace.contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, workspace.contacts],
  );

  const taskIdColumnCh = useMemo(
    () => computeTaskDisplayIdColumnCh(workspace.allTasks),
    [workspace.allTasks],
  );

  const todayHabits = useMemo((): HabitCheckChipItem[] => {
    const todayYmd = getTodayJournalDateSlug();
    const habitById = new Map(
      workspace.habits.map((habit) => [habit.id, habit] as const),
    );
    const items = workspace.allTasks
      .filter(
        (task) =>
          isHabitLinkedTask(task) &&
          task.status !== "canceled" &&
          getTaskDueDateYmd(task.dueDate) === todayYmd,
      )
      .map((task) => {
        const habit = habitById.get(task.habitId!);
        return {
          habitId: task.habitId!,
          taskId: task.id,
          title: habit?.title ?? task.title ?? "Habit",
          icon: habit?.icon ?? null,
          checked: task.status === "completed",
          sortOrder: habit?.sortOrder ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
      })
      .map(({ sortOrder: _sortOrder, ...item }) => item);
    return collapseHabitItemsByHabitId(items);
  }, [workspace.allTasks, workspace.habits]);

  const pendingCreatedTaskTitleRef = useRef<string | null>(null);

  const navigateToTask = (id: string, titleHint?: string | null) => {
    const task = workspace.tasks.find((entry) => entry.id === id);
    const due = dueFilter ?? "today";
    if (!task) {
      const href = `/tasks/${due}/${id}`;
      const title = titleHint?.trim();
      if (title) primeTabTitle(href, title);
      navigate(href);
      return;
    }
    const contact = task.contactId
      ? workspace.contacts.find((entry) => entry.id === task.contactId)
      : null;
    const slug = getInboxTaskRouteSlugForTask({
      number: task.number,
      projectKey: task.projectKey,
      contactKey: contact?.key ?? null,
    });
    const href = `/tasks/${due}/${slug}`;
    const title = task.title || titleHint?.trim() || null;
    if (title) primeTabTitle(href, title);
    navigate(href);
  };

  if (!workspace.ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
        <TasksListSkeleton />
      </div>
    );
  }

  return (
    <TasksOverviewView
      tasks={workspace.tasks}
      todayHabits={todayHabits}
      onToggleTodayHabit={(item, checked) => {
        void workspace.patchTask(item.taskId, {
          status: checked ? "completed" : "ready_to_start",
        });
      }}
      projectOptions={projectOptions}
      assigneeOptions={assigneeOptions}
      taskIdColumnCh={taskIdColumnCh}
      filter={dueFilter}
      onFilterChange={(filter) => {
        navigate(buildTasksDueHref(filter, view));
      }}
      view={view}
      onViewChange={(nextView) => {
        persistListBoardView(nextView, TASKS_LIST_BOARD_STORAGE_KEY);
        navigate(
          buildTasksDueHref(
            dueFilter ?? "today",
            nextView,
          ),
        );
      }}
      onSelectTask={(id) => navigateToTask(id)}
      onStatusChange={(taskId, status) => {
        void workspace.patchTask(taskId, { status });
      }}
      onPriorityChange={(taskId, priority) => {
        void workspace.patchTask(taskId, { priority });
      }}
      onDueDateChange={(taskId, dueDate) => {
        void workspace.patchTask(taskId, {
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      }}
      onProjectChange={(taskId, projectKey) => {
        const project = projectKey
          ? workspace.projects.find((entry) => entry.key === projectKey) ?? null
          : null;
        void workspace.patchTask(taskId, {
          projectId: project?.id ?? null,
        });
      }}
      onAssigneeChange={(taskId, assigneeId) => {
        void workspace.patchTask(taskId, { assigneeId });
      }}
      onBulkDelete={async (taskIds) => {
        for (const taskId of taskIds) {
          await workspace.softDeleteTask(taskId);
        }
      }}
      onReorder={(request) => {
        const patches = taskReorderPatches(workspace.tasks, request);
        for (const patch of patches) {
          void workspace.patchTask(patch.id, {
            status: patch.status,
            sortOrder: patch.sortOrder,
          });
        }
      }}
      renderTaskTitleTrailing={(task) =>
        renderTaskAgentTitleTrailing({
          taskId: task.id,
          agentChatId: task.agentChatId,
          taskStatus: task.status,
          agentStatus,
          workingShownOnStatusIcon: true,
        })
      }
      isTaskAgentWorking={(task) =>
        isTaskAgentWorkingForUi(task, agentStatus)
      }
      onCreateTask={async ({ status, title }) => {
        const dueYmd = getDefaultDueDateYmdForTasksDueFilter(
          dueFilter ?? "today",
        );
        const dueDate = parseYmdLocal(dueYmd);
        pendingCreatedTaskTitleRef.current = title;
        return workspace.createInboxTask({
          title,
          status,
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      }}
      onCreatedTask={(taskId) => {
        const titleHint = pendingCreatedTaskTitleRef.current;
        pendingCreatedTaskTitleRef.current = null;
        navigateToTask(taskId, titleHint);
      }}
    />
  );
}
