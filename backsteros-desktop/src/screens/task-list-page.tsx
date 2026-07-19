import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  TasksListSkeleton,
  TasksOverviewView,
  TASKS_LIST_BOARD_STORAGE_KEY,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  buildTasksDueHref,
  getDefaultDueDateYmdForTasksDueFilter,
  getInboxTaskRouteSlugForTask,
  parseListBoardViewFromLocation,
  parseTasksDueFilterFromLocation,
  parseYmdLocal,
  persistListBoardView,
} from "@backsteros/ui";

import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export function TaskListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useDesktopWorkspaceData();

  useDesktopSectionBreadcrumb([{ label: "Tasks" }]);

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

  const navigateToTask = (id: string) => {
    const task = workspace.tasks.find((entry) => entry.id === id);
    const due = dueFilter ?? "today";
    if (!task) {
      navigate(`/tasks/${due}/${id}`);
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
    navigate(`/tasks/${due}/${slug}`);
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
      projectOptions={projectOptions}
      assigneeOptions={assigneeOptions}
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
      onSelectTask={navigateToTask}
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
      onCreateTask={async ({ status, title }) => {
        const dueYmd = getDefaultDueDateYmdForTasksDueFilter(
          dueFilter ?? "today",
        );
        const dueDate = parseYmdLocal(dueYmd);
        return workspace.createInboxTask({
          title,
          status,
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      }}
      onCreatedTask={navigateToTask}
    />
  );
}
