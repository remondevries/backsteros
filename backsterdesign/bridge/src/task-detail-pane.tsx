import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EntityHeaderActionsShell,
  EntityHeaderActionsSlot,
  getTaskDisplayId,
  RegisterEntityDeleteAction,
  TaskActivityPanel,
  TaskDetailView,
  TrackedTimeField,
  type SearchableDropdownOption,
  type TaskDetailViewTask,
  type TaskItemRowTask,
  type TaskRelatedSelection,
  type TaskStatus,
} from "@backsteros/ui";

import {
  createCoreRequestJson,
  deleteTask,
  fetchTask,
  patchTask,
  postTaskTimerActivity,
  type ApiContact,
  type ApiProject,
  type ApiTask,
  type ApiTaskLink,
  type CoreConfig,
} from "./core-api.js";
import { mapTask } from "./map-task.js";

function parseTaskLinks(value: unknown): ApiTaskLink[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ApiTaskLink =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { createdAt?: unknown }).createdAt === "string",
  );
}

export type TaskDetailPaneProps = {
  config: CoreConfig;
  project: ApiProject;
  taskId: string;
  /** List row used while the full task loads / for optimistic patches. */
  listTask: TaskItemRowTask | null;
  contacts?: readonly ApiContact[];
  /** contact id → object URL for activity / comment avatars. */
  contactAvatarSrc?: Readonly<Record<string, string>>;
  assigneeOptions?: SearchableDropdownOption<string>[];
  relatedOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onBack: () => void;
  onTaskPatched: (taskId: string, patch: Partial<TaskItemRowTask>) => void;
  /** Called after a successful soft-delete so the host can close detail. */
  onTaskDeleted?: () => void;
};

function resolveAssigneeName(
  assigneeId: string | null | undefined,
  apiName: string | null | undefined,
  contacts: readonly ApiContact[],
  listFallback: string | null | undefined,
): string | null {
  if (assigneeId) {
    const contact = contacts.find((entry) => entry.id === assigneeId);
    if (contact?.name?.trim()) return contact.name.trim();
  }
  return apiName?.trim() || listFallback?.trim() || null;
}

function toDetailTask(
  api: ApiTask,
  project: ApiProject,
  listTask: TaskItemRowTask | null,
  contacts: readonly ApiContact[],
): TaskDetailViewTask {
  const mapped = mapTask(api, project);
  const assigneeId = mapped.assigneeId ?? listTask?.assigneeId ?? null;
  const displayId = getTaskDisplayId(
    {
      number: mapped.number,
      projectId: mapped.projectId,
      projectKey: mapped.projectKey,
      contactId: mapped.contactId,
    },
    project.key,
  );
  return {
    id: mapped.id,
    title: mapped.title,
    description: api.description ?? null,
    displayId,
    links: parseTaskLinks(api.links),
    status: mapped.status,
    priority: mapped.priority,
    dueDate: mapped.dueDate,
    dueEndDate: mapped.dueEndDate,
    assigneeId,
    assigneeName: resolveAssigneeName(
      assigneeId,
      api.assigneeName,
      contacts,
      listTask?.ownerInitials,
    ),
    contactId: mapped.contactId ?? null,
    relatedContactIds: mapped.relatedContactIds ?? [],
    relatedOrganizationIds: mapped.relatedOrganizationIds ?? [],
    linkedEmailIds: mapped.linkedEmailIds ?? [],
    labelIds: mapped.labelIds ?? [],
    projectKey: mapped.projectKey ?? project.key,
    projectName: mapped.projectName ?? project.name,
    agentCreatedAt: mapped.agentCreatedAt ?? null,
    agentInboxApprovedAt: mapped.agentInboxApprovedAt ?? null,
    trackedMinutes: mapped.trackedMinutes ?? null,
    trackedDurationSeconds: mapped.trackedDurationSeconds ?? null,
    support: mapped.support ?? false,
    notification: mapped.notification ?? false,
  };
}

export function TaskDetailPane({
  config,
  project,
  taskId,
  listTask,
  contacts = [],
  contactAvatarSrc = {},
  assigneeOptions = [],
  relatedOptions = [],
  projectOptions = [],
  onBack,
  onTaskPatched,
  onTaskDeleted,
}: TaskDetailPaneProps) {
  const [apiTask, setApiTask] = useState<ApiTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const requestJson = useMemo(() => createCoreRequestJson(config), [config]);

  const assigneeAvatarById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      map.set(contact.id, contactAvatarSrc[contact.id] ?? null);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

  const avatarByEmail = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      const email = contact.email?.trim().toLowerCase();
      if (!email) continue;
      const src = contactAvatarSrc[contact.id] ?? null;
      if (src) map.set(email, src);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

  const activityCurrentUser = useMemo(
    () => ({ email: null as string | null, imageUrl: null as string | null }),
    [],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const row = await fetchTask(config, taskId);
      setApiTask(row);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [config, taskId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const detailTask = useMemo(() => {
    if (apiTask) return toDetailTask(apiTask, project, listTask, contacts);
    if (!listTask) return null;
    const assigneeId = listTask.assigneeId ?? null;
    const displayId = getTaskDisplayId(
      {
        number: listTask.number,
        projectId: listTask.projectId,
        projectKey: listTask.projectKey,
        contactId: listTask.contactId,
      },
      project.key,
    );
    return {
      id: listTask.id,
      title: listTask.title,
      description: null,
      displayId,
      links: [],
      status: listTask.status,
      priority: listTask.priority,
      dueDate: listTask.dueDate,
      dueEndDate: listTask.dueEndDate,
      assigneeId,
      assigneeName: resolveAssigneeName(
        assigneeId,
        null,
        contacts,
        listTask.ownerInitials,
      ),
      contactId: listTask.contactId ?? null,
      relatedContactIds: listTask.relatedContactIds ?? [],
      relatedOrganizationIds: listTask.relatedOrganizationIds ?? [],
      linkedEmailIds: listTask.linkedEmailIds ?? [],
      labelIds: listTask.labelIds ?? [],
      projectKey: listTask.projectKey ?? project.key,
      projectName: listTask.projectName ?? project.name,
      agentCreatedAt: listTask.agentCreatedAt ?? null,
      agentInboxApprovedAt: listTask.agentInboxApprovedAt ?? null,
      trackedMinutes: listTask.trackedMinutes ?? null,
      trackedDurationSeconds: listTask.trackedDurationSeconds ?? null,
      support: listTask.support ?? false,
      notification: listTask.notification ?? false,
    } satisfies TaskDetailViewTask;
  }, [apiTask, contacts, listTask, project]);

  const applyPatch = useCallback(
    async (patch: Record<string, unknown>, local: Partial<TaskItemRowTask>) => {
      onTaskPatched(taskId, local);
      setApiTask((current) =>
        current ? ({ ...current, ...patch } as ApiTask) : current,
      );
      try {
        await patchTask(config, taskId, patch);
      } catch {
        void reload();
      }
    },
    [config, onTaskPatched, reload, taskId],
  );

  const onTimerSessionChange = useCallback(
    (action: "start" | "pause", sessionSeconds?: number | null) => {
      void postTaskTimerActivity(config, taskId, action, sessionSeconds).catch(
        () => {
          // Activity feed is best-effort; tracked time still persists.
        },
      );
    },
    [config, taskId],
  );

  const handleDeleteTask = useCallback(async () => {
    try {
      await deleteTask(config, taskId);
      onTaskDeleted?.();
      onBack();
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete task.",
      };
    }
  }, [config, onBack, onTaskDeleted, taskId]);

  const deleteEntityLabel =
    detailTask?.displayId?.trim() || detailTask?.title?.trim() || "task";

  return (
    <EntityHeaderActionsShell>
    <div
      className="backsteros-task-detail-pane"
      data-testid="backsteros-task-detail-pane"
    >
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteTask}
      />
      <header className="backsteros-task-detail-pane__chrome">
        <button
          type="button"
          className="backsteros-task-detail-pane__back"
          onClick={onBack}
        >
          ← Tasks
        </button>
        <div className="backsteros-task-detail-pane__chrome-end">
          {detailTask && !detailTask.support ? (
            <div className="backsteros-task-detail-pane__timer">
              <TrackedTimeField
                variant="pill"
                trackedDurationSeconds={
                  detailTask.trackedDurationSeconds ?? null
                }
                trackedMinutes={detailTask.trackedMinutes ?? null}
                onTrackedDurationSecondsChange={(seconds) => {
                  const trackedMinutes =
                    seconds != null && seconds >= 60
                      ? Math.floor(seconds / 60)
                      : null;
                  void applyPatch(
                    { trackedDurationSeconds: seconds, trackedMinutes },
                    { trackedDurationSeconds: seconds, trackedMinutes },
                  );
                }}
                onTimerSessionChange={onTimerSessionChange}
              />
            </div>
          ) : null}
          <EntityHeaderActionsSlot />
        </div>
      </header>

      {loadError && !detailTask ? (
        <p className="backsteros-project-tasks__error">
          Could not load task: {loadError}
        </p>
      ) : null}

      {loading && !detailTask ? (
        <p className="backsteros-project-tasks__loading">Loading task…</p>
      ) : null}

      {detailTask ? (
        <TaskDetailView
          task={detailTask}
          sectionLabel="Tasks"
          showDisplayId
          showNarrowTimer={false}
          onSaveTitle={async (title) => {
            const next = title.trim();
            if (!next) return { ok: false, error: "Title is required." };
            await applyPatch({ title: next }, { title: next });
            return { ok: true };
          }}
          onSaveDescription={async (value) => {
            const description = value.trim() || null;
            await applyPatch({ description }, {});
            setApiTask((current) =>
              current ? { ...current, description } : current,
            );
          }}
          onChangeLinks={(links) => {
            void applyPatch({ links }, {});
            setApiTask((current) =>
              current ? { ...current, links } : current,
            );
          }}
          designPublicUri={
            typeof window !== "undefined"
              ? window.location.origin
              : "https://localhost:3449"
          }
          onStatusChange={(status: TaskStatus) => {
            void applyPatch({ status }, { status });
          }}
          onPriorityChange={(priority) => {
            void applyPatch({ priority }, { priority });
          }}
          onDueDateChange={(dueDate) => {
            void applyPatch(
              { dueDate: dueDate ? dueDate.toISOString() : null },
              { dueDate: dueDate ? dueDate.getTime() : null },
            );
          }}
          onAssigneeChange={(assigneeId) => {
            const assigneeName = resolveAssigneeName(
              assigneeId,
              null,
              contacts,
              null,
            );
            void applyPatch(
              { assigneeId },
              { assigneeId, ownerInitials: assigneeName },
            );
          }}
          onRelatedChange={(related: TaskRelatedSelection) => {
            void applyPatch(
              {
                relatedContactIds: related.contactIds,
                relatedOrganizationIds: related.organizationIds,
                linkedEmailIds: related.emailIds,
              },
              {
                relatedContactIds: related.contactIds,
                relatedOrganizationIds: related.organizationIds,
                linkedEmailIds: related.emailIds,
              },
            );
          }}
          onProjectChange={(projectKey) => {
            if (!projectKey || projectKey === project.key) return;
            // Design is scoped to the linked Penpot project — keep project fixed.
          }}
          assigneeOptions={assigneeOptions}
          relatedOptions={relatedOptions}
          projectOptions={projectOptions}
          onTrackedDurationSecondsChange={(seconds) => {
            const trackedMinutes =
              seconds != null && seconds >= 60
                ? Math.floor(seconds / 60)
                : null;
            void applyPatch(
              { trackedDurationSeconds: seconds, trackedMinutes },
              { trackedDurationSeconds: seconds, trackedMinutes },
            );
          }}
          onTimerSessionChange={onTimerSessionChange}
          belowDescription={
            <TaskActivityPanel
              taskId={taskId}
              taskUpdatedAt={apiTask?.updatedAt ?? listTask?.updatedAt ?? null}
              requestJson={requestJson}
              currentUser={activityCurrentUser}
              assigneeAvatarById={assigneeAvatarById}
              avatarByEmail={avatarByEmail}
            />
          }
        />
      ) : null}
    </div>
    </EntityHeaderActionsShell>
  );
}
