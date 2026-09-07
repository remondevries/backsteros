import { useCallback, useEffect, useRef, useState } from "react";

import {
  createBacksterosTaskActivity,
  createBacksterosTaskComment,
  deleteBacksterosTaskComment,
  fetchBacksterosContact,
  fetchBacksterosContacts,
  fetchBacksterosOrganizations,
  fetchBacksterosTask,
  fetchBacksterosTaskActivities,
  fetchBacksterosTaskComments,
  updateBacksterosTask,
  updateBacksterosTaskComment,
} from "./client";
import type {
  BacksterosContact,
  BacksterosOrganization,
  BacksterosTaskActivity,
  BacksterosTaskComment,
  BacksterosTaskDetail,
  BacksterosTaskUpdatePatch,
} from "./types";
import {
  subscribeBacksterosTaskStatusChanged,
  notifyBacksterosTaskStatusChanged,
} from "./promoteWorkingTask";
import { backsterosTaskDetailRevisionFingerprint } from "./backsterosEntityFingerprint";
import { migrateBacksterosTaskStatus } from "./taskStatus";
import { syncBacksterosTaskKickoffDraftPrompt } from "./taskKickoffDraftSync";
import { useBacksterosSoftPoll } from "./useBacksterosSoftPoll";

export type BacksterosTaskDetailState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly task: BacksterosTaskDetail;
      readonly comments: readonly BacksterosTaskComment[];
      readonly activities: readonly BacksterosTaskActivity[];
      readonly assignee: BacksterosContact | null;
      readonly contacts: readonly BacksterosContact[];
      readonly organizations: readonly BacksterosOrganization[];
    }
  | { readonly status: "error"; readonly message: string };

function normalizeTask(task: BacksterosTaskDetail): BacksterosTaskDetail {
  return {
    ...task,
    relatedContactIds: task.relatedContactIds ?? [],
    relatedOrganizationIds: task.relatedOrganizationIds ?? [],
  };
}

function taskDetailFingerprint(
  task: BacksterosTaskDetail,
  comments: readonly BacksterosTaskComment[],
  activities: readonly BacksterosTaskActivity[],
  assignee: BacksterosContact | null,
): string {
  return backsterosTaskDetailRevisionFingerprint({
    taskId: task.id,
    taskUpdatedAt: task.updatedAt,
    assigneeId: assignee?.id ?? task.assigneeId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    dueEndDate: task.dueEndDate,
    contactId: task.contactId,
    relatedContactIds: task.relatedContactIds,
    relatedOrganizationIds: task.relatedOrganizationIds,
    comments,
    activities,
  });
}

export function useBacksterosTaskDetail(taskId: string | null): {
  readonly state: BacksterosTaskDetailState;
  readonly reload: () => void;
  readonly addComment: (body: string, parentCommentId?: string | null) => Promise<void>;
  readonly editComment: (
    commentId: string,
    patch: { readonly body?: string; readonly resolvedAt?: string | null },
  ) => Promise<void>;
  readonly deleteComment: (commentId: string) => Promise<void>;
  readonly patchTask: (patch: BacksterosTaskUpdatePatch) => Promise<void>;
  readonly postTimerActivity: (action: "start" | "pause", sessionSeconds?: number | null) => void;
} {
  const [state, setState] = useState<BacksterosTaskDetailState>({ status: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!taskId) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    void (async () => {
      try {
        const task = await fetchBacksterosTask(taskId, controller.signal);
        if (controller.signal.aborted) return;

        const settled = await Promise.allSettled([
          fetchBacksterosTaskComments(taskId, controller.signal),
          fetchBacksterosTaskActivities(taskId, controller.signal),
          fetchBacksterosContacts(controller.signal),
          fetchBacksterosOrganizations(controller.signal),
        ]);
        if (controller.signal.aborted) return;

        const comments = settled[0].status === "fulfilled" ? settled[0].value : [];
        const activities = settled[1].status === "fulfilled" ? settled[1].value : [];
        const contacts = settled[2].status === "fulfilled" ? settled[2].value : [];
        const organizations = settled[3].status === "fulfilled" ? settled[3].value : [];

        let assignee: BacksterosContact | null = null;
        if (task.assigneeId) {
          assignee = contacts.find((contact) => contact.id === task.assigneeId) ?? null;
          if (!assignee) {
            try {
              assignee = await fetchBacksterosContact(task.assigneeId, controller.signal);
            } catch {
              assignee = null;
            }
          }
        }
        if (controller.signal.aborted) return;

        setState({
          status: "ready",
          task: normalizeTask(task),
          comments: comments.filter((comment) => comment.deletedAt == null),
          activities,
          assignee,
          contacts,
          organizations,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Failed to load BacksterOS task";
        setState({ status: "error", message });
      }
    })();

    return () => controller.abort();
  }, [reloadToken, taskId]);

  useBacksterosSoftPoll(Boolean(taskId) && state.status === "ready", async () => {
    if (!taskId) return;
    const current = stateRef.current;
    if (current.status !== "ready" || current.task.id !== taskId) return;

    const controller = new AbortController();
    try {
      const task = normalizeTask(await fetchBacksterosTask(taskId, controller.signal));
      const [commentsResult, activitiesResult] = await Promise.allSettled([
        fetchBacksterosTaskComments(taskId, controller.signal),
        fetchBacksterosTaskActivities(taskId, controller.signal),
      ]);
      const comments =
        commentsResult.status === "fulfilled"
          ? commentsResult.value.filter((comment) => comment.deletedAt == null)
          : current.comments;
      const activities =
        activitiesResult.status === "fulfilled" ? activitiesResult.value : current.activities;

      let assignee = current.assignee;
      if (task.assigneeId !== current.task.assigneeId) {
        if (!task.assigneeId) {
          assignee = null;
        } else {
          assignee = current.contacts.find((contact) => contact.id === task.assigneeId) ?? null;
          if (!assignee) {
            try {
              assignee = await fetchBacksterosContact(task.assigneeId, controller.signal);
            } catch {
              assignee = null;
            }
          }
        }
      }

      const nextFingerprint = taskDetailFingerprint(task, comments, activities, assignee);
      const prevFingerprint = taskDetailFingerprint(
        current.task,
        current.comments,
        current.activities,
        current.assignee,
      );
      if (nextFingerprint === prevFingerprint) return;

      if (task.title !== current.task.title || task.description !== current.task.description) {
        syncBacksterosTaskKickoffDraftPrompt({
          taskId,
          number: task.number,
          title: task.title,
          description: task.description,
        });
      }

      setState({
        status: "ready",
        task,
        comments,
        activities,
        assignee,
        contacts: current.contacts,
        organizations: current.organizations,
      });
    } finally {
      controller.abort();
    }
  });

  useEffect(() => {
    if (!taskId) return;
    return subscribeBacksterosTaskStatusChanged(({ taskId: changedTaskId, status }) => {
      if (changedTaskId !== taskId) return;
      // Keep the open detail in sync when status changes elsewhere (inbox, automation).
      // Do not reload — that would flash and undo optimistic UI.
      setState((current) => {
        if (current.status !== "ready" || current.task.id !== taskId) return current;
        if (current.task.status === status) return current;
        return {
          ...current,
          task: { ...current.task, status },
        };
      });
    });
  }, [taskId]);

  const addComment = useCallback(
    async (body: string, parentCommentId?: string | null) => {
      if (!taskId) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      const created = await createBacksterosTaskComment(taskId, trimmed, parentCommentId);
      setState((current) => {
        if (current.status !== "ready" || current.task.id !== taskId) return current;
        return {
          ...current,
          comments: [...current.comments, created],
        };
      });
    },
    [taskId],
  );

  const editComment = useCallback(
    async (
      commentId: string,
      patch: { readonly body?: string; readonly resolvedAt?: string | null },
    ) => {
      if (!taskId) return;
      if (patch.body != null && !patch.body.trim()) return;
      const updated = await updateBacksterosTaskComment(taskId, commentId, {
        ...patch,
        ...(patch.body != null ? { body: patch.body.trim() } : {}),
      });
      setState((current) => {
        if (current.status !== "ready" || current.task.id !== taskId) return current;
        return {
          ...current,
          comments: current.comments.map((comment) =>
            comment.id === commentId ? updated : comment,
          ),
        };
      });
    },
    [taskId],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!taskId) return;
      await deleteBacksterosTaskComment(taskId, commentId);
      setState((current) => {
        if (current.status !== "ready" || current.task.id !== taskId) return current;
        return {
          ...current,
          comments: current.comments.filter(
            (comment) => comment.id !== commentId && comment.parentCommentId !== commentId,
          ),
        };
      });
    },
    [taskId],
  );

  const patchTask = useCallback(
    async (patch: BacksterosTaskUpdatePatch) => {
      if (!taskId) return;

      let rollback: Extract<BacksterosTaskDetailState, { status: "ready" }> | null = null;
      let optimisticKickoffSync: {
        readonly number: number;
        readonly title: string;
        readonly description: string | null;
      } | null = null;

      setState((current) => {
        if (current.status !== "ready" || current.task.id !== taskId) return current;
        rollback = current;
        const nextAssigneeId =
          "assigneeId" in patch ? (patch.assigneeId ?? null) : current.task.assigneeId;
        const optimisticAssignee =
          nextAssigneeId == null
            ? null
            : (current.contacts.find((contact) => contact.id === nextAssigneeId) ??
              (current.assignee?.id === nextAssigneeId ? current.assignee : null));
        const { activityActor: _activityActor, ...taskPatch } = patch;
        const nextTask = normalizeTask({
          ...current.task,
          ...taskPatch,
          assigneeId: nextAssigneeId,
        });
        if (patch.title != null || patch.description !== undefined) {
          optimisticKickoffSync = {
            number: nextTask.number,
            title: nextTask.title,
            description: nextTask.description,
          };
        }
        return {
          ...current,
          task: nextTask,
          assignee: "assigneeId" in patch ? optimisticAssignee : current.assignee,
        };
      });

      if (optimisticKickoffSync) {
        syncBacksterosTaskKickoffDraftPrompt({
          taskId,
          number: optimisticKickoffSync.number,
          title: optimisticKickoffSync.title,
          description: optimisticKickoffSync.description,
        });
      }

      if (patch.status != null) {
        notifyBacksterosTaskStatusChanged({
          taskId,
          status: migrateBacksterosTaskStatus(patch.status),
        });
      }

      try {
        const updated = normalizeTask(await updateBacksterosTask(taskId, patch));
        const [activities, assignee] = await Promise.all([
          fetchBacksterosTaskActivities(taskId),
          updated.assigneeId ? fetchBacksterosContact(updated.assigneeId) : Promise.resolve(null),
        ]);
        setState((current) => {
          if (current.status !== "ready" || current.task.id !== taskId) return current;
          const resolvedAssignee =
            assignee ??
            (updated.assigneeId
              ? (current.contacts.find((contact) => contact.id === updated.assigneeId) ?? null)
              : null);
          return {
            ...current,
            task: updated,
            activities,
            assignee: resolvedAssignee,
          };
        });
        if (patch.title != null || patch.description !== undefined) {
          syncBacksterosTaskKickoffDraftPrompt({
            taskId,
            number: updated.number,
            title: updated.title,
            description: updated.description,
          });
        }
        if (patch.status != null) {
          notifyBacksterosTaskStatusChanged({
            taskId,
            status: migrateBacksterosTaskStatus(updated.status),
          });
        }
      } catch (error) {
        if (rollback) {
          const previous = rollback;
          setState(previous);
          if (patch.status != null) {
            notifyBacksterosTaskStatusChanged({
              taskId,
              status: migrateBacksterosTaskStatus(previous.task.status),
            });
          }
        }
        throw error;
      }
    },
    [taskId],
  );

  const postTimerActivity = useCallback(
    (action: "start" | "pause", sessionSeconds?: number | null) => {
      if (!taskId) return;
      const body =
        action === "start"
          ? { type: "timer_started" as const }
          : {
              type: "timer_stopped" as const,
              data: {
                durationSeconds: Math.max(0, Math.round(sessionSeconds ?? 0)),
              },
            };
      void createBacksterosTaskActivity(taskId, body)
        .then(async () => {
          const activities = await fetchBacksterosTaskActivities(taskId);
          setState((current) => {
            if (current.status !== "ready" || current.task.id !== taskId) {
              return current;
            }
            return { ...current, activities };
          });
        })
        .catch(() => {
          // Activity feed is best-effort; tracked time still persists separately.
        });
    },
    [taskId],
  );

  return {
    state,
    reload,
    addComment,
    editComment,
    deleteComment,
    patchTask,
    postTimerActivity,
  };
}
