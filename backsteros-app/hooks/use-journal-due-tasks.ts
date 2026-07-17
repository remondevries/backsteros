"use client";

import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import { useMemo } from "react";

import { useApiResource } from "@/lib/api-context";
import { normalizeContact, normalizeProject, normalizeTask } from "@/lib/entity-normalize";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { useAppTimezone } from "@/components/settings/app-timezone-provider";
import type { TaskWithContextSummary } from "@/lib/db/queries/tasks";
import { isValidJournalDateSlug } from "@/lib/journal/dates";
import { getTaskDueDateYmd } from "@/lib/tasks-due-filters";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

/** Tasks due on a specific journal entry date, using the app timezone (Settings → General). */
export function useJournalDueTasks(dateSlug: string) {
  const calendarTimeZone = useAppTimezone();

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
    "SELECT * FROM tasks WHERE deleted_at IS NULL",
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
    if (!isValidJournalDateSlug(dateSlug)) {
      return [];
    }

    const rows =
      localTasks.data?.map((row) => snakeRow(row) as ApiTask) ??
      tasksResource.data?.tasks ??
      [];

    return rows
      .map((task) => {
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
      })
      .filter(
        (task) => getTaskDueDateYmd(task.dueDate, calendarTimeZone) === dateSlug,
      );
  }, [
    calendarTimeZone,
    contactsById,
    dateSlug,
    localTasks.data,
    projectsById,
    tasksResource.data,
  ]);

  const isLoading = tasksResource.loading && !localTasks.data;

  return { tasks, isLoading };
}
