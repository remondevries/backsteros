"use client";

import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DueTasksContent } from "@/components/due-tasks/due-tasks-content";
import { TasksDueNav } from "@/components/due-tasks/tasks-due-nav";
import { TasksListSkeleton } from "@/components/tasks/tasks-list-skeleton";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import { mapContactToAssignable } from "@/lib/contacts/assignable-contact";
import type { TaskWithContextSummary } from "@/lib/db/queries/tasks";
import {
  normalizeContact,
  normalizeProject,
  normalizeTask,
} from "@/lib/entity-normalize";
import { parseProjectTaskView } from "@/lib/project-task-view";
import { mapProjectToAssignable } from "@/lib/projects/assignable-project";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { DEFAULT_APP_TIMEZONE } from "@/lib/settings/app-timezone";
import {
  buildTasksDueHref,
  parseTasksDueFilter,
} from "@/lib/tasks-due-filters";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

function TasksScreenInner({ dueSegment }: { dueSegment?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dueFilter = parseTasksDueFilter(dueSegment ?? searchParams.get("due"));
  const initialView = parseProjectTaskView(searchParams.get("view"));

  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson("/api/v1/tasks"),
  );
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM tasks WHERE deleted_at IS NULL AND (inbox = 0 OR inbox IS NULL) ORDER BY sort_order, updated_at DESC",
  );

  const projectsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeProject>>();
    for (const project of projectsResource.data?.projects ?? []) {
      const normalized = normalizeProject(project);
      map.set(normalized.id, normalized);
    }
    return map;
  }, [projectsResource.data]);

  const contactsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeContact>>();
    for (const contact of contactsResource.data?.contacts ?? []) {
      const normalized = normalizeContact(contact);
      map.set(normalized.id, normalized);
    }
    return map;
  }, [contactsResource.data]);

  const tasks = useMemo((): TaskWithContextSummary[] => {
    const rows =
      localTasks.data?.map((row) => snakeRow(row) as ApiTask) ??
      tasksResource.data?.tasks ??
      [];
    return rows.map((task) => {
      const normalized = normalizeTask(task);
      const project = task.projectId
        ? projectsById.get(task.projectId) ?? null
        : null;
      const contact = task.contactId
        ? contactsById.get(task.contactId) ?? null
        : null;
      return {
        ...normalized,
        project: project
          ? {
              id: project.id,
              key: project.key,
              name: project.name,
              icon: project.icon,
            }
          : null,
        contact: contact ? { key: contact.key } : null,
      };
    });
  }, [contactsById, localTasks.data, projectsById, tasksResource.data]);

  const assignableProjects = useMemo(
    () =>
      (projectsResource.data?.projects ?? []).map((project) =>
        mapProjectToAssignable(normalizeProject(project)),
      ),
    [projectsResource.data],
  );

  const contacts = useMemo(
    () =>
      (contactsResource.data?.contacts ?? []).map((contact) =>
        mapContactToAssignable({
          ...normalizeContact(contact),
          organization: null,
        }),
      ),
    [contactsResource.data],
  );

  if (tasksResource.error && !localTasks.data) {
    return (
      <div className="error-state">
        <strong>Could not load tasks</strong>
        <p>{apiErrorMessage(tasksResource.error)}</p>
        <button type="button" onClick={tasksResource.reload}>
          Try again
        </button>
      </div>
    );
  }

  const showContentLoading = tasksResource.loading && !localTasks.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
      <TasksDueNav
        activeFilter={dueFilter}
        onFilterChange={(filter) => {
          router.replace(buildTasksDueHref({ due: filter, view: initialView }), {
            scroll: false,
          });
        }}
      />
      {showContentLoading ? (
        <TasksListSkeleton />
      ) : (
        <DueTasksContent
          dueFilter={dueFilter}
          initialView={initialView}
          calendarTimeZone={DEFAULT_APP_TIMEZONE}
          tasks={tasks}
          assignableProjects={assignableProjects}
          contacts={contacts}
          defaultAssigneeId={null}
        />
      )}
    </div>
  );
}

export function TasksScreen({ dueSegment }: { dueSegment?: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
          <TasksListSkeleton />
        </div>
      }
    >
      <TasksScreenInner dueSegment={dueSegment} />
    </Suspense>
  );
}
