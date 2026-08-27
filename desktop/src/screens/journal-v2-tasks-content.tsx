import { useMemo, useRef } from "react";
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
  type HabitCheckChipItem,
} from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";
import { useTasksRouteSearch } from "../router/use-tasks-route-search";

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
import { useKeepAliveActive, useKeepAliveFrozen } from "../lib/shell-route-keep-alive";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";

export function JournalV2TasksContent() {
  return <JournalV2PageBody />;
}

const NO_ENTITIES: [] = [];
const NO_EMAIL_ROWS: ReturnType<typeof mapEmailMessagesToTaskRows> = [];
const JOURNAL_V2_LIST_PATH = "/journal-v2";
const JOURNAL_V2_BOARD_STORAGE_KEY = "journal-v2-list-board-view";


function JournalV2PageBody() {
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
  const keepAliveFrozen = useKeepAliveFrozen();
  useDesktopSectionBreadcrumb([{ label: "Journal v2" }], {
    enabled: keepAliveActive,
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
    navigateToHref(navigate, href);
  };

  return (
    <TasksOverviewView
      tasks={tasksWithEmails}
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
        navigateToHref(navigate, buildTasksDueHref(filter, view, JOURNAL_V2_LIST_PATH));
      }}
      view={view}
      onViewChange={(nextView) => {
        persistListBoardView(nextView, JOURNAL_V2_BOARD_STORAGE_KEY);
        navigateToHref(
          navigate,
          buildTasksDueHref(
            dueFilter ?? "today",
            nextView,
            JOURNAL_V2_LIST_PATH,
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
