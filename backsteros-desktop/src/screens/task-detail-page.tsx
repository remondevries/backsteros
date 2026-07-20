import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  TaskDetailSkeleton,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  buildTasksDueHref,
  encodeTaskSlug,
  getInboxTaskRouteSlugForTask,
  getTaskDisplayId,
  getTasksDueFilterLabel,
  isTasksDueFilter,
  type TasksDueFilter,
} from "@backsteros/ui";

import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export type TaskDetailPageProps = {
  taskRouteParam?: string;
  backHref?: string;
  breadcrumbItems?: { label: string; href?: string }[];
};

function taskMatchesRouteParam(
  entry: {
    id: string;
    number: number;
    projectId: string | null;
    projectKey?: string | null;
    contactId?: string | null;
    contactKey?: string | null;
  },
  routeParam: string | undefined,
): boolean {
  if (!routeParam) return false;
  if (entry.id === routeParam) return true;

  const normalized = decodeURIComponent(routeParam).toLowerCase();
  const displayId = getTaskDisplayId(
    {
      number: entry.number,
      projectId: entry.projectId,
      contactId: entry.contactId,
    },
    entry.projectKey ?? entry.contactKey,
  );
  if (displayId?.toLowerCase() === normalized) return true;

  const slug = getInboxTaskRouteSlugForTask({
    number: entry.number,
    projectKey: entry.projectKey,
    contactKey: entry.contactKey,
  });
  if (slug === normalized) return true;

  if (
    entry.projectKey &&
    encodeTaskSlug(entry.projectKey, entry.number) === normalized
  ) {
    return true;
  }

  if (
    entry.contactKey &&
    encodeTaskSlug(entry.contactKey, entry.number) === normalized
  ) {
    return true;
  }

  return false;
}

export function TaskDetailPage({
  taskRouteParam,
  backHref: backHrefProp,
  breadcrumbItems: breadcrumbItemsProp,
}: TaskDetailPageProps = {}) {
  const navigate = useNavigate();
  const { taskId, taskSlug, dueFilter: dueFilterParam } = useParams<{
    taskId?: string;
    taskSlug?: string;
    dueFilter?: string;
  }>();
  const routeParam = taskRouteParam ?? taskSlug ?? taskId;
  const dueFilter: TasksDueFilter | null =
    dueFilterParam && isTasksDueFilter(dueFilterParam) ? dueFilterParam : null;
  const backHref =
    backHrefProp ??
    (dueFilter ? buildTasksDueHref(dueFilter) : "/tasks");
  const workspace = useDesktopWorkspaceData();
  const { allTasks, projects, contacts } = workspace;

  const base =
    allTasks.find((entry) => {
      const contact = entry.contactId
        ? contacts.find((c) => c.id === entry.contactId)
        : null;
      return taskMatchesRouteParam(
        {
          ...entry,
          contactKey: contact?.key ?? null,
        },
        routeParam,
      );
    }) ?? null;

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
        })),
      ),
    [projects],
  );

  const task = useMemo(() => {
    if (!base) return null;
    const resolvedProjectKey = base.projectKey ?? null;
    const project =
      projects.find((entry) => entry.key === resolvedProjectKey) ?? null;
    const resolvedAssigneeId = base.assigneeId ?? null;
    const assignee =
      contacts.find((entry) => entry.id === resolvedAssigneeId) ?? null;
    return {
      ...base,
      assigneeId: resolvedAssigneeId,
      assigneeName: assignee?.name ?? null,
      projectKey: resolvedProjectKey,
      projectName: project?.name ?? base.projectName ?? null,
      description: workspace.taskDescriptions[base.id] ?? "",
      displayId: getTaskDisplayId(
        {
          number: base.number,
          projectId: base.projectId,
        },
        base.projectKey,
      ),
    };
  }, [base, contacts, projects, workspace.taskDescriptions]);

  const taskLabel = task
    ? task.displayId
      ? `${task.displayId} ${task.title}`
      : task.title
    : null;

  const breadcrumbItems = useMemo(() => {
    if (breadcrumbItemsProp) {
      return [
        ...breadcrumbItemsProp,
        ...(taskLabel ? [{ label: taskLabel }] : []),
      ];
    }
    if (dueFilter) {
      return [
        { label: "Tasks", href: "/tasks" },
        {
          label: getTasksDueFilterLabel(dueFilter),
          href: buildTasksDueHref(dueFilter),
        },
        ...(taskLabel ? [{ label: taskLabel }] : []),
      ];
    }
    return taskLabel
      ? [
          { label: "Tasks", href: backHref },
          { label: taskLabel },
        ]
      : [{ label: "Tasks", href: backHref }];
  }, [backHref, breadcrumbItemsProp, dueFilter, taskLabel]);

  useDesktopSectionBreadcrumb(breadcrumbItems);

  const handleDeleteTask = useCallback(async () => {
    if (!base) {
      return { ok: false as const, error: "Task is required." };
    }
    try {
      await workspace.softDeleteTask(base.id);
      navigate(backHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to delete task.",
      };
    }
  }, [backHref, base, navigate, workspace]);

  if (!task) {
    if (!workspace.ready) {
      return <TaskDetailSkeleton />;
    }
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>Task not found.</p>
          <button type="button" onClick={() => navigate(backHref)}>
            Back to tasks
          </button>
        </div>
      </div>
    );
  }

  const deleteEntityLabel = task.displayId
    ? `task ${task.displayId}`
    : "task";

  return (
    <>
      <RegisterPageTitle title={task.title} />
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteTask}
      />
      <TaskDetailView
        task={task}
        onStatusChange={(next) => {
          void workspace.patchTask(task.id, { status: next });
        }}
        onPriorityChange={(next) => {
          void workspace.patchTask(task.id, { priority: next });
        }}
        onDueDateChange={(next) => {
          void workspace.patchTask(task.id, {
            dueDate: next ? next.toISOString() : null,
          });
        }}
        onAssigneeChange={(next) => {
          void workspace.patchTask(task.id, { assigneeId: next });
        }}
        onProjectChange={(next) => {
          const project = next
            ? projects.find((entry) => entry.key === next) ?? null
            : null;
          void workspace.patchTask(task.id, {
            projectId: project?.id ?? null,
          });
        }}
        onSaveDescription={(description) => {
          void workspace.patchTask(task.id, { description });
        }}
        onSaveTitle={async (title) => {
          const trimmed = title.trim();
          if (!trimmed) {
            return { ok: false as const, error: "Task title is required." };
          }
          try {
            await workspace.patchTask(task.id, { title: trimmed });
            return { ok: true as const };
          } catch (error) {
            return {
              ok: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not rename task.",
            };
          }
        }}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        assigneeNavigateHref={
          task.assigneeId ? `/contacts/${task.assigneeId}` : null
        }
        projectNavigateHref={
          task.projectKey ? `/projects/${task.projectKey}` : null
        }
        onCreateAssigneeFromQuery={(query) => {
          void workspace.createContact({ name: query }).then((created) => {
            void workspace.patchTask(task.id, { assigneeId: created.id });
          });
        }}
      />
    </>
  );
}
