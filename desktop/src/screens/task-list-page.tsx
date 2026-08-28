import { useEffect, useMemo, useRef } from "react";
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

export function TaskListPage() {
  const { taskId, taskSlug } = useShellParams() as {
    taskId?: string;
    taskSlug?: string;
  };
  const taskRouteParam = taskSlug ?? taskId;
  const showDetail = Boolean(taskRouteParam);
  if (taskRouteParam) {
    tasksSectionRetainedRouteParamRef.current = taskRouteParam;
    tasksSectionDetailHostEverRef.current = true;
  }

  useEffect(() => {
    void taskDetailPage.load();
    void import("../components/desktop-task-layout");
    const preloadAgent = () => {
      void import("../components/desktop-agent-chat-panel");
    };
    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(preloadAgent);
      return () => cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(preloadAgent, 150);
    return () => window.clearTimeout(timer);
  }, []);

  const retainedTaskRouteParam =
    taskRouteParam ?? tasksSectionRetainedRouteParamRef.current;
  const detailHostMounted = tasksSectionDetailHostEverRef.current;

  return (
    <div className="tasks-section-page">
      <div
        className="tasks-section-page__list"
        hidden={showDetail}
        aria-hidden={showDetail || undefined}
      >
        <TaskListPageBody listHidden={showDetail} />
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
            bootstrapTask={tasksSectionBootstrapRef.current}
          />
        </div>
      ) : null}
    </div>
  );
}

const NO_ENTITIES: [] = [];
const NO_EMAIL_ROWS: ReturnType<typeof mapEmailMessagesToTaskRows> = [];

function TaskListPageBody({ listHidden = false }: { listHidden?: boolean }) {
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

  const pendingCreatedTaskTitleRef = useRef<string | null>(null);

  const findListTask = (id: string) =>
    tasksWithEmails.find((entry) => entry.id === id) ?? null;

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
    if (!task || isEmailTaskListItem(task)) {
      const href = `/tasks/${due}/${id}`;
      const title = titleHint?.trim();
      if (title) primeTabTitle(href, title);
      tasksSectionBootstrapRef.current = task
        ? {
            id: task.id,
            title: task.title,
            number: task.number,
            status: task.status,
            priority: task.priority,
            projectKey: task.projectKey ?? null,
            projectId: task.projectId ?? null,
            projectName: task.projectName ?? null,
            agentChatId: task.agentChatId ?? null,
            assigneeId: task.assigneeId ?? null,
            routeSlug: id,
          }
        : {
            id,
            title: titleHint?.trim() ?? "Task",
            number: 0,
            status: "backlog",
            routeSlug: id,
          };
      navigateToHref(navigate, href);
      return;
    }
    const contact = task.contactId
      ? contacts.find((entry) => entry.id === task.contactId)
      : null;
    const slug = getInboxTaskRouteSlugForTask({
      number: task.number,
      projectKey: task.projectKey,
      contactKey: contact?.key ?? null,
    });
    const href = `/tasks/${due}/${slug}`;
    const title = task.title || titleHint?.trim() || null;
    if (title) primeTabTitle(href, title);
    tasksSectionBootstrapRef.current = {
      id: task.id,
      title: task.title,
      number: task.number,
      status: task.status,
      priority: task.priority,
      projectKey: task.projectKey ?? null,
      projectId: task.projectId ?? null,
      projectName: task.projectName ?? null,
      agentChatId: task.agentChatId ?? null,
      assigneeId: task.assigneeId ?? null,
      routeSlug: slug,
    };
    navigateToHref(navigate, href);
  };

  return (
    <TasksOverviewView
      tasks={tasksWithEmails}
      todayHabits={todayHabits}
      listKeyboardEnabled={keepAliveActive && !listHidden}
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
      onProjectChange={(taskId, projectKey) => {
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
          return;
        }
        void workspace.patchTask(taskId, {
          projectId: project?.id ?? null,
        });
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
