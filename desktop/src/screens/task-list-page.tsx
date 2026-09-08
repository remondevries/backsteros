import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  TasksOverviewView,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  buildTasksDueHref,
  computeTaskDisplayIdColumnCh,
  getDefaultDueDateYmdForTasksDueFilter,
  getInboxTaskRouteSlugForTask,
  getTaskDueDateYmd,
  getTodayJournalDateSlug,
  isHabitLinkedTask,
  parseYmdLocal,
  persistListBoardView,
  primeTabTitle,
  taskReorderPatches,
  collapseHabitItemsByHabitId,
  TASKS_LIST_BOARD_STORAGE_KEY,
  type HabitCheckChipItem,
} from "@backsteros/ui";

import { taskDetailPage } from "../router/shell-route-modules";
import { navigateToHref } from "../router/navigate-href";
import { useTasksRouteSearch } from "../router/use-tasks-route-search";
import { TaskDetailPage, type TaskDetailBootstrap } from "./task-detail-page";

import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import {
  isTaskAgentWorkingForUi,
  renderTaskAgentTitleTrailing,
} from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopApi } from "../lib/api-context";
import {
  getEmailTaskListHref,
  isEmailTaskListItem,
  mapEmailMessagesToTaskRows,
  patchEmailTaskListItem,
} from "../lib/email-list-tasks";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";

const tasksSectionBootstrapRef: {
  current: TaskDetailBootstrap | null;
} = { current: null };

/** Survives TaskListPage remount when leaving and returning to Tasks. */
const tasksSectionDetailHostEverRef = { current: false };
/** Survives remount — component useRef was wiped while module host flag stayed true. */
const tasksSectionRetainedRouteParamRef: { current: string | null } = {
  current: null,
};

function taskHasRouteNumber(
  number: number | null | undefined,
): number is number {
  return typeof number === "number" && Number.isFinite(number) && number > 0;
}

function primeTasksSectionBootstrap(bootstrap: TaskDetailBootstrap) {
  // Ref must update synchronously: warm keep-alive re-renders before setState.
  tasksSectionBootstrapRef.current = bootstrap;
}

export function TaskListPage() {
  const { taskId, taskSlug } = useShellParams() as {
    taskId?: string;
    taskSlug?: string;
  };
  const taskRouteParam = taskSlug ?? taskId;
  const showDetail = Boolean(taskRouteParam);
  const [bootstrapTask, setBootstrapTask] = useState<TaskDetailBootstrap | null>(
    null,
  );
  if (taskRouteParam) {
    tasksSectionRetainedRouteParamRef.current = taskRouteParam;
    tasksSectionDetailHostEverRef.current = true;
  }

  useEffect(() => {
    void taskDetailPage.load();
    void import("../components/desktop-task-layout");
  }, []);

  const retainedTaskRouteParam =
    taskRouteParam ?? tasksSectionRetainedRouteParamRef.current;
  const detailHostMounted = tasksSectionDetailHostEverRef.current;
  const resolvedBootstrap =
    bootstrapTask &&
    retainedTaskRouteParam &&
    (bootstrapTask.routeSlug === retainedTaskRouteParam ||
      bootstrapTask.id === retainedTaskRouteParam)
      ? bootstrapTask
      : tasksSectionBootstrapRef.current;

  return (
    <div className="tasks-section-page">
      <div
        className="tasks-section-page__list"
        hidden={showDetail}
        aria-hidden={showDetail || undefined}
      >
        <TaskListPageBody
          listHidden={showDetail}
          onBootstrapTask={(next) => {
            if (next) {
              primeTasksSectionBootstrap(next);
              setBootstrapTask(next);
              return;
            }
            tasksSectionBootstrapRef.current = null;
            setBootstrapTask(null);
          }}
        />
      </div>
      {detailHostMounted && retainedTaskRouteParam ? (
        <div
          className={[
            "tasks-section-page__detail",
            !showDetail ? "is-offscreen" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden={!showDetail || undefined}
        >
          <TaskDetailPage
            taskRouteParam={retainedTaskRouteParam}
            detailVisible={showDetail}
            bootstrapTask={resolvedBootstrap}
          />
        </div>
      ) : null}
    </div>
  );
}

const NO_ENTITIES: [] = [];
const NO_EMAIL_ROWS: ReturnType<typeof mapEmailMessagesToTaskRows> = [];

function TaskListPageBody({
  listHidden = false,
  onBootstrapTask,
}: {
  listHidden?: boolean;
  onBootstrapTask: (bootstrap: TaskDetailBootstrap | null) => void;
}) {
  const navigate = useNavigate();
  const { tasks, allTasks } = useDesktopWorkspaceTasks();
  const { projects } = useDesktopWorkspaceProjects();
  const { contacts } = useDesktopWorkspacePeople();
  const { habits } = useDesktopWorkspaceMeta();
  const workspace = useDesktopWorkspaceActions();
  const agentStatus = useDesktopAgentStatusOptional();
  const agentMail = useAgentMail();
  const { client } = useDesktopApi();

  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen() || listHidden;
  useDesktopSectionBreadcrumb([{ label: "Tasks" }], {
    enabled: keepAliveActive && !listHidden,
  });

  const { dueFilter, view } = useTasksRouteSearch();

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? NO_ENTITIES : contacts,
  );

  const projectOptions = useMemo(
    () => buildProjectDropdownOptions(projects),
    [projects],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        keepAliveFrozen ? contacts : withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts, keepAliveFrozen],
  );

  const emailMailboxes = useMemo(
    () =>
      keepAliveFrozen
        ? []
        : agentMail.mailboxes.map((mailbox) => ({
            ...mailbox,
            avatarSrc: mailbox.contactId
              ? contactAvatarSrc[mailbox.contactId] ?? null
              : null,
          })),
    [agentMail.mailboxes, contactAvatarSrc, keepAliveFrozen],
  );

  const emailTaskRows = useMemo(
    () =>
      keepAliveFrozen
        ? NO_EMAIL_ROWS
        : mapEmailMessagesToTaskRows(agentMail.messages, emailMailboxes),
    [agentMail.messages, emailMailboxes, keepAliveFrozen],
  );

  const tasksWithEmails = useMemo(
    () => [...tasks, ...emailTaskRows],
    [emailTaskRows, tasks],
  );

  const taskIdColumnCh = useMemo(
    () => computeTaskDisplayIdColumnCh(allTasks),
    [allTasks],
  );

  const todayHabits = useMemo((): HabitCheckChipItem[] => {
    const todayYmd = getTodayJournalDateSlug();
    const habitById = new Map(
      habits.map((habit) => [habit.id, habit] as const),
    );
    const items = allTasks
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
  }, [allTasks, habits]);

  const pendingCreatedTaskRef = useRef<{
    title: string;
    status: string;
  } | null>(null);

  const findListTask = (id: string) =>
    tasksWithEmails.find((entry) => entry.id === id) ??
    allTasks.find((entry) => entry.id === id) ??
    null;

  const navigateToTask = (id: string, titleHint?: string | null) => {
    const task = findListTask(id);
    const emailHref = task ? getEmailTaskListHref(task) : null;
    if (emailHref) {
      const title = task?.title || titleHint?.trim() || null;
      if (title) primeTabTitle(emailHref, title);
      navigateToHref(navigate, emailHref);
      return;
    }
    const due = dueFilter ?? "today";
    const pending = pendingCreatedTaskRef.current;
    const title =
      task?.title || titleHint?.trim() || pending?.title?.trim() || "Task";
    const status = task?.status || pending?.status || "ready_to_start";
    const number = taskHasRouteNumber(task?.number) ? task.number : null;

    // Prefer id until a display number exists — `in-null` slugs flash Not found.
    if (!task || isEmailTaskListItem(task) || number == null) {
      const href = `/tasks/${due}/${id}`;
      primeTabTitle(href, title);
      onBootstrapTask({
        id,
        title,
        number: number ?? null,
        status,
        priority: task?.priority,
        projectKey: task?.projectKey ?? null,
        projectId: task?.projectId ?? null,
        projectName: task?.projectName ?? null,
        agentChatId: task?.agentChatId ?? null,
        assigneeId: task?.assigneeId ?? null,
        routeSlug: id,
      });
      navigateToHref(navigate, href);
      return;
    }
    const contact = task.contactId
      ? contacts.find((entry) => entry.id === task.contactId)
      : null;
    const slug = getInboxTaskRouteSlugForTask({
      number,
      projectKey: task.projectKey,
      contactKey: contact?.key ?? null,
    });
    const href = `/tasks/${due}/${slug}`;
    primeTabTitle(href, title);
    onBootstrapTask({
      id: task.id,
      title: task.title,
      number,
      status: task.status,
      priority: task.priority,
      projectKey: task.projectKey ?? null,
      projectId: task.projectId ?? null,
      projectName: task.projectName ?? null,
      agentChatId: task.agentChatId ?? null,
      assigneeId: task.assigneeId ?? null,
      routeSlug: slug,
    });
    navigateToHref(navigate, href);
  };

  return (
    <TasksOverviewView
      tasks={tasksWithEmails}
      todayHabits={todayHabits}
      listKeyboardEnabled={keepAliveActive && !listHidden}
      onToggleTodayHabit={(item, checked) => {
        void workspace.patchTask(item.taskId, {
          status: checked ? "completed" : "canceled",
        });
      }}
      projectOptions={projectOptions}
      assigneeOptions={assigneeOptions}
      taskIdColumnCh={taskIdColumnCh}
      filter={dueFilter}
      onFilterChange={(filter) => {
        navigateToHref(navigate, buildTasksDueHref(filter, view));
      }}
      view={view}
      onViewChange={(nextView) => {
        persistListBoardView(nextView, TASKS_LIST_BOARD_STORAGE_KEY);
        navigateToHref(
          navigate,
          buildTasksDueHref(
            dueFilter ?? "today",
            nextView,
          ),
        );
      }}
      onSelectTask={(id) => navigateToTask(id)}
      onStatusChange={(taskId, status) => {
        const task = findListTask(taskId);
        if (task && isEmailTaskListItem(task)) {
          void patchEmailTaskListItem(client, task, { status });
          return;
        }
        void workspace.patchTask(taskId, { status });
      }}
      onPriorityChange={(taskId, priority) => {
        const task = findListTask(taskId);
        if (task && isEmailTaskListItem(task)) {
          void patchEmailTaskListItem(client, task, { priority });
          return;
        }
        void workspace.patchTask(taskId, { priority });
      }}
      onDueDateChange={(taskId, dueDate) => {
        const task = findListTask(taskId);
        if (task && isEmailTaskListItem(task)) {
          void patchEmailTaskListItem(client, task, {
            dueDate: dueDate ? dueDate.toISOString() : null,
          });
          return;
        }
        void workspace.patchTask(taskId, {
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      }}
      onProjectChange={async (taskId, projectKey) => {
        const project = projectKey
          ? projects.find((entry) => entry.key === projectKey) ?? null
          : null;
        const task = findListTask(taskId);
        if (task && isEmailTaskListItem(task)) {
          void patchEmailTaskListItem(
            client,
            task,
            { projectId: project?.id ?? null },
            {
              projectName: project?.name ?? null,
              projectKey: project?.key ?? null,
            },
          );
          return {
            projectId: project?.id ?? null,
          };
        }
        const updated = await workspace.patchTask(taskId, {
          projectId: project?.id ?? null,
          ...(project ? { inbox: false } : {}),
        });
        return {
          number: updated?.number ?? null,
          projectId: project?.id ?? null,
        };
      }}
      onAssigneeChange={(taskId, assigneeId) => {
        const task = findListTask(taskId);
        if (task && isEmailTaskListItem(task)) {
          const assignee = assigneeId
            ? contacts.find((entry) => entry.id === assigneeId) ??
              null
            : null;
          void patchEmailTaskListItem(
            client,
            task,
            { assigneeId },
            { assigneeName: assignee?.name ?? null },
          );
          return;
        }
        void workspace.patchTask(taskId, { assigneeId });
      }}
      onBulkDelete={async (taskIds) => {
        for (const taskId of taskIds) {
          const task = findListTask(taskId);
          if (task && isEmailTaskListItem(task)) {
            continue;
          }
          await workspace.softDeleteTask(taskId);
        }
      }}
      onReorder={(request) => {
        const patches = taskReorderPatches(tasksWithEmails, request).filter(
          (patch) => {
            const task = findListTask(patch.id);
            return !task || !isEmailTaskListItem(task);
          },
        );
        for (const patch of patches) {
          void workspace.patchTask(patch.id, {
            status: patch.status,
            sortOrder: patch.sortOrder,
          });
        }
      }}
      renderTaskTitleTrailing={(task) =>
        isEmailTaskListItem(task)
          ? null
          : renderTaskAgentTitleTrailing({
              taskId: task.id,
              agentChatId: task.agentChatId,
              taskStatus: task.status,
              agentStatus,
              workingShownOnStatusIcon: true,
            })
      }
      isTaskAgentWorking={(task) =>
        isEmailTaskListItem(task)
          ? false
          : isTaskAgentWorkingForUi(task, agentStatus)
      }
      onCreateTask={async ({ status, title }) => {
        const dueYmd = getDefaultDueDateYmdForTasksDueFilter(
          dueFilter ?? "today",
        );
        const dueDate = parseYmdLocal(dueYmd);
        pendingCreatedTaskRef.current = { title, status };
        // Due lists are non-inbox (`isTasksListTask`). Creating with inbox:true
        // opened the detail briefly then vanished from Today/Tomorrow after leave.
        const created = await workspace.createInboxTask({
          title,
          status,
          dueDate: dueDate ? dueDate.toISOString() : null,
          inbox: false,
        });
        // Seed detail before navigation so the first paint never flashes Not found.
        onBootstrapTask({
          id: created.id,
          title,
          number: created.number ?? null,
          status,
          routeSlug: created.id,
        });
        return created;
      }}
      onCreatedTask={(taskId) => {
        const pending = pendingCreatedTaskRef.current;
        pendingCreatedTaskRef.current = null;
        navigateToTask(taskId, pending?.title);
      }}
    />
  );
}
