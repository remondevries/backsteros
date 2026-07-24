"use client";

import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  TaskDetailSkeleton,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
} from "@backsteros/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { ContactRouteBreadcrumb } from "@/components/contacts/contact-route-breadcrumb";
import { RegisterEntityDeleteAction } from "@/components/entity-actions/register-entity-delete-action";
import { DetailBreadcrumbLeaf } from "@/components/navigation/detail-breadcrumb-leaf";
import { ProjectRouteBreadcrumb } from "@/components/projects/project-route-breadcrumb";
import { RegisterTabTitle } from "@/components/shell/register-tab-title";
import { AppTaskActivityPanel } from "@/components/tasks/app-task-activity-panel";
import { TasksSectionBreadcrumb } from "@/components/tasks/tasks-section-breadcrumb";
import { getContactAvatarSrc } from "@/lib/avatars/urls";
import { useApiResource } from "@/lib/api-context";
import {
  getContactHref,
  getProjectHrefFromKey,
} from "@/lib/entity-route-hrefs";
import {
  normalizeContact,
  normalizeProject,
  normalizeTask,
} from "@/lib/entity-normalize";
import {
  encodeProjectSlug,
  isEntityRouteUuid,
  parseTaskSlug,
} from "@/lib/entity-slugs";
import { createContactAction } from "@/lib/mutations/contacts";
import {
  deleteTaskAction,
  moveTaskToProjectAction,
  updateTaskAssigneeAction,
  updateTaskDescriptionAction,
  updateTaskDueDateAction,
  updateTaskLinksAction,
  updateTaskPriorityAction,
  updateTaskStatusAction,
  updateTaskTitleAction,
} from "@/lib/mutations/tasks";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { projectMatchesRouteParam } from "@/lib/project-sections";
import { findLocalOrApi } from "@/lib/sync/prefer-local-or-api";
import { getTaskDisplayId, INBOX_TASK_KEY } from "@/lib/task-display-id";
import type { TaskPriority } from "@/lib/task-priority";
import type { TaskStatus } from "@/lib/task-status";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

function contactAvatarUpdatedAt(contact: {
  avatarUpdatedAt?: number | Date | null;
  updatedAt?: string | Date | number | null;
}): number {
  if (contact.avatarUpdatedAt != null) {
    return contact.avatarUpdatedAt instanceof Date
      ? contact.avatarUpdatedAt.getTime()
      : Number(contact.avatarUpdatedAt);
  }
  if (contact.updatedAt == null) return 0;
  if (contact.updatedAt instanceof Date) return contact.updatedAt.getTime();
  if (typeof contact.updatedAt === "number") return contact.updatedAt;
  const parsed = Date.parse(String(contact.updatedAt));
  return Number.isFinite(parsed) ? parsed : 0;
}

function taskMatchesParam(
  task: ReturnType<typeof normalizeTask>,
  routeParam: string,
  projectsById: Map<string, ReturnType<typeof normalizeProject>>,
  contactsById: Map<string, ReturnType<typeof normalizeContact>>,
) {
  if (task.id === routeParam) return true;
  if (isEntityRouteUuid(routeParam)) return task.id === routeParam;

  const parsed = parseTaskSlug(routeParam);
  if (!parsed) {
    // No bare-number fallback — same number exists across projects
    // (LD-2 vs AF-2). Desktop dropped this for the same reason.
    return false;
  }

  if (task.number !== parsed.number) return false;

  const project = task.projectId ? projectsById.get(task.projectId) : null;
  const contact = task.contactId ? contactsById.get(task.contactId) : null;
  // Always resolve from the task itself — never borrow the URL's project
  // scope. Using scopedProject.key here made every #-N task match ld-N.
  const resolvedContext =
    project?.key ?? contact?.key ?? (task.inbox ? INBOX_TASK_KEY : null);

  if (!resolvedContext) return false;
  return (
    encodeProjectSlug(resolvedContext) ===
    encodeProjectSlug(parsed.contextKey)
  );
}

type TaskDetailScreenProps = {
  taskRouteParam: string;
  projectRouteParam?: string;
  context?: "inbox" | "project" | "tasks" | "trail";
  backHref?: string;
};

export function TaskDetailScreen({
  taskRouteParam,
  projectRouteParam,
  context = "tasks",
  backHref,
}: TaskDetailScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson(
      context === "inbox" ? "/api/v1/tasks/inbox" : "/api/v1/tasks",
    ),
  );
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    context === "inbox"
      ? "SELECT * FROM tasks WHERE deleted_at IS NULL AND inbox = 1"
      : "SELECT * FROM tasks WHERE deleted_at IS NULL",
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM projects WHERE deleted_at IS NULL",
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM contacts WHERE deleted_at IS NULL",
  );

  const projectsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeProject>>();
    const rows =
      localProjects.data?.map((row) => snakeRow(row) as ApiProject) ??
      projectsResource.data?.projects ??
      [];
    for (const project of rows) {
      const normalized = normalizeProject(project);
      map.set(normalized.id, normalized);
    }
    return map;
  }, [localProjects.data, projectsResource.data]);

  const contactsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeContact>>();
    const rows =
      localContacts.data?.map((row) => snakeRow(row) as ApiContact) ??
      contactsResource.data?.contacts ??
      [];
    for (const contact of rows) {
      const normalized = normalizeContact(contact);
      map.set(normalized.id, normalized);
    }
    return map;
  }, [contactsResource.data, localContacts.data]);

  const projects = useMemo(() => [...projectsById.values()], [projectsById]);
  const contacts = useMemo(() => [...contactsById.values()], [contactsById]);

  const scopedProject = useMemo(() => {
    if (!projectRouteParam) return null;
    const match = projects.find((entry) =>
      projectMatchesRouteParam(entry, projectRouteParam),
    );
    return match ?? null;
  }, [projectRouteParam, projects]);

  const baseTask = useMemo(() => {
    const localRows =
      localTasks.data?.map((row) => snakeRow(row) as ApiTask) ?? null;
    const apiRows = tasksResource.data?.tasks ?? null;
    const match = findLocalOrApi(localRows, apiRows, (row) =>
      taskMatchesParam(
        normalizeTask(row),
        taskRouteParam,
        projectsById,
        contactsById,
      ),
    );
    return match ? normalizeTask(match) : null;
  }, [
    contactsById,
    localTasks.data,
    projectsById,
    taskRouteParam,
    tasksResource.data,
  ]);

  const project = baseTask?.projectId
    ? projectsById.get(baseTask.projectId) ?? null
    : scopedProject;

  const assignee = baseTask?.assigneeId
    ? contactsById.get(baseTask.assigneeId) ?? null
    : null;

  const contextKey = baseTask
    ? project?.key ?? (baseTask.inbox ? INBOX_TASK_KEY : null)
    : null;
  const displayId = baseTask ? getTaskDisplayId(baseTask, contextKey) : null;

  const task = useMemo(() => {
    if (!baseTask) return null;
    return {
      id: baseTask.id,
      title: baseTask.title,
      description: baseTask.description ?? "",
      links: baseTask.links ?? [],
      status: baseTask.status,
      priority: baseTask.priority,
      dueDate: baseTask.dueDate,
      assigneeId: baseTask.assigneeId,
      assigneeName: assignee?.name ?? null,
      projectKey: project?.key ?? null,
      projectName: project?.name ?? null,
      displayId,
    };
  }, [assignee?.name, baseTask, displayId, project?.key, project?.name]);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          organizationName: null,
          avatarSrc: contact.avatarStorageKey
            ? getContactAvatarSrc(contact.id, contactAvatarUpdatedAt(contact))
            : undefined,
        })),
      ),
    [contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((entry) => ({
          key: entry.key,
          name: entry.name,
          icon: entry.icon,
        })),
      ),
    [projects],
  );

  const handleDeleteTask = useCallback(async () => {
    if (!baseTask) {
      return { ok: false as const, error: "Task is required." };
    }
    const result = await deleteTaskAction({
      taskId: baseTask.id,
      pathname,
    });
    if (!result.ok) {
      return result;
    }
    router.replace(result.redirectHref);
    return result;
  }, [baseTask, pathname, router]);

  const isLoading =
    (tasksResource.loading || projectsResource.loading) && !baseTask;

  if (!isLoading && !task) {
    return (
      <div className="error-state" data-content-detail>
        <strong>Task not found</strong>
        <p>No task matches “{taskRouteParam}”.</p>
        {backHref ? <Link href={backHref}>Go back</Link> : null}
      </div>
    );
  }

  const deleteEntityLabel = displayId ? `task ${displayId}` : "task";
  const contactRouteMatch = pathname.match(/^\/contacts\/([^/]+)/);
  const contactRouteParam = contactRouteMatch?.[1]
    ? decodeURIComponent(contactRouteMatch[1])
    : null;

  return (
    <>
      {task ? <RegisterTabTitle title={task.title} /> : null}
      {baseTask ? (
        <RegisterEntityDeleteAction
          entityLabel={deleteEntityLabel}
          onDelete={handleDeleteTask}
        />
      ) : null}
      {context !== "trail" && projectRouteParam ? (
        <ProjectRouteBreadcrumb projectRouteParam={projectRouteParam} />
      ) : null}
      {context !== "trail" && contactRouteParam ? (
        <ContactRouteBreadcrumb contactRouteParam={contactRouteParam} />
      ) : null}
      {context === "tasks" && !projectRouteParam && !contactRouteParam ? (
        <TasksSectionBreadcrumb />
      ) : null}
      {context !== "trail" && task ? (
        <DetailBreadcrumbLeaf label={task.title} displayId={displayId} />
      ) : null}

      {isLoading || !task || !baseTask ? (
        <TaskDetailSkeleton />
      ) : (
        <TaskDetailView
          task={task}
          onStatusChange={(next) => {
            void updateTaskStatusAction({
              taskId: baseTask.id,
              projectId: baseTask.projectId,
              status: next as TaskStatus,
            });
          }}
          onPriorityChange={(next) => {
            void updateTaskPriorityAction({
              taskId: baseTask.id,
              projectId: baseTask.projectId,
              priority: next as TaskPriority,
            });
          }}
          onDueDateChange={(next) => {
            void updateTaskDueDateAction({
              taskId: baseTask.id,
              projectId: baseTask.projectId,
              dueDate: next ? next.toISOString() : null,
            });
          }}
          onAssigneeChange={(next) => {
            void updateTaskAssigneeAction({
              taskId: baseTask.id,
              projectId: baseTask.projectId,
              assigneeId: next,
            });
          }}
          onProjectChange={(next) => {
            const selected = next
              ? projects.find((entry) => entry.key === next) ?? null
              : null;
            void moveTaskToProjectAction({
              taskId: baseTask.id,
              projectId: selected?.id ?? null,
            });
          }}
          onSaveDescription={(description) => {
            void updateTaskDescriptionAction({
              taskId: baseTask.id,
              projectId: baseTask.projectId,
              description,
            });
          }}
          onChangeLinks={(links) => {
            void updateTaskLinksAction({
              taskId: baseTask.id,
              projectId: baseTask.projectId,
              links,
            });
          }}
          onSaveTitle={async (title) => {
            const trimmed = title.trim();
            if (!trimmed) {
              return { ok: false as const, error: "Task title is required." };
            }
            return updateTaskTitleAction({
              taskId: baseTask.id,
              projectId: baseTask.projectId,
              title: trimmed,
            });
          }}
          assigneeOptions={assigneeOptions}
          projectOptions={projectOptions}
          assigneeNavigateHref={
            assignee
              ? getContactHref({
                  number: assignee.number,
                  key: assignee.key,
                  id: assignee.id,
                })
              : null
          }
          projectNavigateHref={
            project?.key ? getProjectHrefFromKey(project.key) : null
          }
          onCreateAssigneeFromQuery={(query) => {
            void createContactAction({ name: query }).then((created) => {
              if (!created.ok) return;
              void updateTaskAssigneeAction({
                taskId: baseTask.id,
                projectId: baseTask.projectId,
                assigneeId: created.contactId,
              });
            });
          }}
          belowDescription={
            <AppTaskActivityPanel
              taskId={baseTask.id}
              taskUpdatedAt={
                baseTask.updatedAt instanceof Date
                  ? baseTask.updatedAt.toISOString()
                  : (baseTask.updatedAt ?? null)
              }
              contacts={contacts}
            />
          }
        />
      )}
    </>
  );
}
