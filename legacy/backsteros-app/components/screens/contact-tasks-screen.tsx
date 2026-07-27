"use client";

import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import Link from "next/link";
import { useMemo } from "react";

import { ContactLayoutBreadcrumb } from "@/components/contacts/contact-layout-breadcrumb";
import { ContactNav } from "@/components/contacts/contact-nav";
import { ContactTasksList } from "@/components/contacts/contact-tasks-list";
import { TasksListSkeleton } from "@/components/tasks/tasks-list-skeleton";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import {
  contactMatchesRouteSlug,
  getCanonicalContactRouteParam,
} from "@/lib/entity-route-hrefs";
import {
  normalizeContact,
  normalizeProject,
  normalizeTask,
} from "@/lib/entity-normalize";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { mapProjectToAssignable } from "@/lib/projects/assignable-project";
import {
  findLocalOrApi,
  preferLocalOrApi,
} from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

export function ContactTasksScreen({
  contactParam,
  organizationRouteParam,
}: {
  contactParam: string;
  organizationRouteParam?: string;
}) {
  const organizationContext = useOrganizationRouteContext(organizationRouteParam);
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM contacts WHERE deleted_at IS NULL",
  );

  const contact = useMemo(() => {
    const match = findLocalOrApi(
      localContacts.data?.map((row) => snakeRow(row) as ApiContact),
      contactsResource.data?.contacts,
      (entry) => contactMatchesRouteSlug(entry, contactParam),
    );
    return match ? normalizeContact(match) : null;
  }, [contactParam, contactsResource.data, localContacts.data]);

  const tasksResource = useApiResource<{ tasks: ApiTask[] }>(
    (client) =>
      contact
        ? client.requestJson(
            `/api/v1/tasks?assigneeId=${encodeURIComponent(contact.id)}`,
          )
        : Promise.resolve({ tasks: [] as ApiTask[] }),
    [contact?.id],
  );

  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    contact
      ? "SELECT * FROM tasks WHERE deleted_at IS NULL AND (assignee_id = ? OR contact_id = ?) ORDER BY sort_order, updated_at DESC"
      : null,
    contact ? [contact.id, contact.id] : [],
  );

  const tasks = useMemo(() => {
    const rows = preferLocalOrApi(
      localTasks.data?.map((row) => snakeRow(row) as ApiTask),
      tasksResource.data?.tasks,
    );
    return rows.map(normalizeTask);
  }, [localTasks.data, tasksResource.data]);

  const assignableProjects = useMemo(
    () =>
      (projectsResource.data?.projects ?? []).map((entry) =>
        mapProjectToAssignable(normalizeProject(entry)),
      ),
    [projectsResource.data],
  );

  const awaitingContact =
    !contact && (contactsResource.loading || localContacts.loading);
  const awaitingTasks =
    Boolean(contact) && tasksResource.loading && !localTasks.data;
  const showContentLoading = awaitingContact || awaitingTasks;

  if (!awaitingContact && !contact) {
    return (
      <div className="error-state">
        <strong>Contact not found</strong>
        <p>No contact matches “{contactParam}”.</p>
        <Link href="/contacts">Back to contacts</Link>
      </div>
    );
  }

  const routeParam = contact
    ? getCanonicalContactRouteParam(contact)
    : contactParam;
  const error = contact && !localTasks.data ? tasksResource.error : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ContactLayoutBreadcrumb
        contactRouteParam={routeParam}
        contactName={contact?.name ?? contactParam}
        organizationContext={organizationContext}
      />
      <ContactNav contactRouteParam={routeParam} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {showContentLoading ? <TasksListSkeleton /> : null}
        {error ? (
          <div className="error-state">
            <strong>Could not load tasks</strong>
            <p>{apiErrorMessage(error)}</p>
            <button type="button" onClick={tasksResource.reload}>
              Try again
            </button>
          </div>
        ) : null}
        {!showContentLoading && !error && contact && tasks.length === 0 ? (
          <div className="empty-state px-2 py-6">
            <h2 className="text-sm font-medium text-foreground/80">
              No tasks for this contact
            </h2>
            <p className="text-xs text-foreground/50">
              Tasks assigned to this contact will show up here.
            </p>
          </div>
        ) : null}
        {!showContentLoading && !error && contact && tasks.length > 0 ? (
          <ContactTasksList
            contactId={contact.id}
            contactKey={contact.key}
            tasks={tasks}
            assignableProjects={assignableProjects}
            onTasksChanged={tasksResource.reload}
          />
        ) : null}
      </div>
    </div>
  );
}
