import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type CreateTaskInput,
  shouldClearInboxUpdatedOnUserWrite,
  taskPatchKeepsWaitingFollowUp,
  type UpdateTaskInput,
} from "@backsteros/contracts";

import {
  assertRelatedContactIds,
  assertRelatedOrganizationIds,
  assertWorkspaceReference,
  contactDisplayName,
  type DbExecutor,
  dueDateIso,
  normalizeLinkedEmailIds,
  normalizeRelatedContactIds,
  normalizeRelatedOrganizationIds,
  projectDisplayName,
  relatedContactDisplayNames,
  relatedContactIdsEqual,
  relatedOrganizationDisplayNames,
  relatedOrganizationIdsEqual,
} from "./shared.js";
import { contacts, type DbTask, entityCounters, habits, tasks } from "../../db/schema.js";
import * as taskActivityService from "../task-activities.js";
import type { TaskWriteActor } from "../task-activities.js";
import { getProjectById } from "./projects.js";
import {
  assertTaskLabelIds,
  normalizeTaskLabelIds,
  touchTaskLabelsUsed,
} from "../task-labels.js";
import { resolveCreateTaskInbox, resolveCreateTaskStatus } from "../../lib/create-task-defaults.js";
import { normalizeAgentWorkingKind, resolveAgentWorkingFields } from "../../lib/agent-working.js";
import { normalizeTaskLinkUrls, resolveTaskPenpotDesignFields } from "../../lib/task-penpot-design-link.js";
import { isExecutionLocation } from "../execution-location.js";
import { bumpAgentSearchCache } from "../../lib/agent-search-cache.js";
import { newId } from "../../lib/crypto.js";
import { db } from "../../db/index.js";
import { mergeLinkedCommitShas } from "../../lib/linked-commit-shas.js";
import { nudgeDynamicIslandTasksRefresh } from "../../lib/dynamic-island-nudge.js";
import { enqueueAutoReviewDelivery } from "../auto-review-webhook.js";
/**
 * OS-42 / OS-49: peer sync replay / controlled task writes.
 * Activity rows and auto-timer transitions arrive as their own sync entities;
 * replaying a task change must not invent a second copy.
 */
export type TaskWriteOptions = {
  /** Preserve the sync_event row time instead of stamping now. */
  updatedAt?: Date;
  /**
   * Peer sync_event replay — do not invent activity rows or auto-timer
   * start/stop; those replicate as task_activity / timer sync entities.
   */
  skipActivitySideEffects?: boolean;
  allowAgentInboxApproval?: boolean;
  authKind?: "api_key" | "local_shell";
};

function taskScope(projectId?: string | null, contactId?: string | null) {
  return projectId
    ? `project:${projectId}`
    : contactId
      ? `contact:${contactId}`
      : "__inbox__";
}

/**
 * Allocate the next task number for a scope.
 *
 * Counters can lag behind imported/legacy rows. Always floor allocation at
 * max(existing number)+1 so display IDs like CI-2 are never reused — including
 * soft-deleted and legacy rows.
 */
async function nextTaskNumber(
  workspaceId: string,
  projectId: string | null | undefined,
  contactId: string | null | undefined,
  executor: DbExecutor,
) {
  const scopeId = taskScope(projectId, contactId);
  const scopeFilter = projectId
    ? eq(tasks.projectId, projectId)
    : contactId
      ? and(isNull(tasks.projectId), eq(tasks.contactId, contactId))
      : and(isNull(tasks.projectId), isNull(tasks.contactId));

  const [maxRow] = await executor
    .select({
      maxNumber: sql<number>`coalesce(max(${tasks.number}), 0)`,
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), scopeFilter));

  const minNext = Number(maxRow?.maxNumber ?? 0) + 1;

  const [counter] = await executor
    .insert(entityCounters)
    .values({
      workspaceId,
      entity: "task",
      scopeId,
      nextValue: minNext + 1,
    })
    .onConflictDoUpdate({
      target: [
        entityCounters.workspaceId,
        entityCounters.entity,
        entityCounters.scopeId,
      ],
      set: {
        nextValue: sql`greatest(${entityCounters.nextValue}, ${minNext}) + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ nextValue: entityCounters.nextValue });

  return counter!.nextValue - 1;
}

async function createTaskWithExecutor(
  workspaceId: string,
  input: CreateTaskInput,
  id: string,
  executor: DbExecutor,
  actor?: TaskWriteActor | null,
  options?: TaskWriteOptions,
) {
  if (input.projectId) {
    const project = await getProjectById(workspaceId, input.projectId, executor);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.contactId,
    contacts,
    "CONTACT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.assigneeId,
    contacts,
    "ASSIGNEE_NOT_FOUND",
    executor,
  );
  const relatedContactIds = normalizeRelatedContactIds(input.relatedContactIds);
  await assertRelatedContactIds(workspaceId, relatedContactIds, executor);
  const relatedOrganizationIds = normalizeRelatedOrganizationIds(
    input.relatedOrganizationIds,
  );
  await assertRelatedOrganizationIds(
    workspaceId,
    relatedOrganizationIds,
    executor,
  );
  const linkedEmailIds = normalizeLinkedEmailIds(input.linkedEmailIds);
  const labelIds = normalizeTaskLabelIds(input.labelIds);
  await assertTaskLabelIds(workspaceId, labelIds, executor);
  await assertWorkspaceReference(
    workspaceId,
    input.habitId,
    habits,
    "HABIT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.agentWorkingContactId,
    contacts,
    "AGENT_WORKING_CONTACT_NOT_FOUND",
    executor,
  );

  const number = await nextTaskNumber(
    workspaceId,
    input.projectId ?? null,
    input.contactId ?? null,
    executor,
  );
  const support = input.support ?? false;
  const notification = input.notification ?? false;
  const status = resolveCreateTaskStatus({
    status: input.status,
    support,
    notification,
  });
  if (
    !taskPatchKeepsWaitingFollowUp({
      currentStatus: status,
      currentFollowUpDate: null,
      nextStatus: status,
      nextFollowUpDate: input.followUpDate,
    })
  ) {
    throw new Error("WAITING_FOLLOW_UP_REQUIRED");
  }
  const agentInbox =
    options?.authKind === "api_key" || actor?.kind === "agent";
  const agentCreatedAt =
    input.agentCreatedAt !== undefined
      ? input.agentCreatedAt
        ? new Date(input.agentCreatedAt)
        : null
      : agentInbox
        ? new Date()
        : null;
  const inboxUpdatedAt =
    input.inboxUpdatedAt !== undefined
      ? input.inboxUpdatedAt
        ? new Date(input.inboxUpdatedAt)
        : null
      : undefined;
  const writeAt = options?.updatedAt;
  const skipActivity = Boolean(options?.skipActivitySideEffects);
  const agentWorking = resolveAgentWorkingFields({
    existing: { contactId: null, startedAt: null, label: null, kind: null },
    agentWorkingContactId: input.agentWorkingContactId,
    agentWorkingLabel: input.agentWorkingLabel,
    agentWorkingKind: input.agentWorkingKind,
    nextStatus: status,
    now: writeAt ?? new Date(),
  });
  const links = normalizeTaskLinkUrls(input.links ?? []);
  const penpotDesign = resolveTaskPenpotDesignFields({
    links,
    penpotFileId: input.penpotFileId,
    penpotPageId: input.penpotPageId,
    penpotObjectId: input.penpotObjectId,
  });

  const [row] = await executor
    .insert(tasks)
    .values({
      id,
      workspaceId,
      projectId: input.projectId ?? null,
      contactId: input.contactId ?? null,
      assigneeId: input.assigneeId ?? null,
      relatedContactIds,
      relatedOrganizationIds,
      linkedEmailIds,
      labelIds,
      number,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      dueEndDate: input.dueEndDate ? new Date(input.dueEndDate) : null,
      followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
      triagedAt: input.triagedAt ? new Date(input.triagedAt) : null,
      inbox: resolveCreateTaskInbox({
        inbox: input.inbox,
        support,
        notification,
        projectId: input.projectId,
        contactId: input.contactId,
      }),
      support,
      notification,
      links,
      penpotFileId: penpotDesign.penpotFileId,
      penpotPageId: penpotDesign.penpotPageId,
      penpotObjectId: penpotDesign.penpotObjectId,
      agentChatId: input.agentChatId ?? null,
      executionLocation: isExecutionLocation(input.executionLocation)
        ? input.executionLocation
        : null,
      executionLocationLockedAt:
        input.lockExecutionLocation === true ? (writeAt ?? new Date()) : null,
      agentWorkingContactId: agentWorking.contactId,
      agentWorkingStartedAt: agentWorking.startedAt,
      agentWorkingLabel: agentWorking.label,
      agentWorkingKind: agentWorking.kind,
      linkedCommitShas: input.linkedCommitShas ?? [],
      automateCompletion: input.automateCompletion ?? false,
      habitId: input.habitId ?? null,
      trackedMinutes: input.trackedMinutes ?? null,
      trackedDurationSeconds: input.trackedDurationSeconds ?? null,
      completedAt: status === "completed" ? (writeAt ?? new Date()) : null,
      agentCreatedAt,
      ...(inboxUpdatedAt !== undefined ? { inboxUpdatedAt } : {}),
      ...(writeAt ? { updatedAt: writeAt, createdAt: writeAt } : {}),
    })
    .returning();

  if (row) {
    if (labelIds.length > 0) {
      await touchTaskLabelsUsed(workspaceId, labelIds, executor);
    }
    if (!skipActivity) {
      await taskActivityService.recordTaskActivity(
        workspaceId,
        row.id,
        "created",
        { status: row.status },
        actor,
        executor,
      );
      if (row.assigneeId) {
        const toName = await contactDisplayName(
          workspaceId,
          row.assigneeId,
          executor,
        );
        await taskActivityService.recordTaskActivity(
          workspaceId,
          row.id,
          "assignee_changed",
          { from: null, to: row.assigneeId, fromName: null, toName },
          actor,
          executor,
        );
      }
      if (relatedContactIds.length > 0) {
        const toNames = await relatedContactDisplayNames(
          workspaceId,
          relatedContactIds,
          executor,
        );
        await taskActivityService.recordTaskActivity(
          workspaceId,
          row.id,
          "related_contacts_changed",
          { from: [], to: relatedContactIds, fromNames: [], toNames },
          actor,
          executor,
        );
      }
      if (relatedOrganizationIds.length > 0) {
        const toNames = await relatedOrganizationDisplayNames(
          workspaceId,
          relatedOrganizationIds,
          executor,
        );
        await taskActivityService.recordTaskActivity(
          workspaceId,
          row.id,
          "related_organizations_changed",
          { from: [], to: relatedOrganizationIds, fromNames: [], toNames },
          actor,
          executor,
        );
      }
      if (taskActivityService.shouldAutoStartTaskTimer(null, row.status)) {
        await taskActivityService.autoStartTaskTimerOnStatus(
          workspaceId,
          row.id,
          row.assigneeId,
          executor,
        );
      }
    }
  }

  bumpAgentSearchCache(workspaceId);
  return row;
}

export async function createTask(
  workspaceId: string,
  input: CreateTaskInput,
  id = newId(),
  executor?: DbExecutor,
  actor?: TaskWriteActor | null,
  options?: TaskWriteOptions,
) {
  if (executor) {
    return createTaskWithExecutor(
      workspaceId,
      input,
      id,
      executor,
      actor,
      options,
    );
  }
  return db.transaction((tx) =>
    createTaskWithExecutor(workspaceId, input, id, tx, actor, options),
  );
}

export async function updateTask(
  workspaceId: string,
  id: string,
  input: UpdateTaskInput,
  executor: DbExecutor = db,
  actor?: TaskWriteActor | null,
  options?: TaskWriteOptions,
): Promise<DbTask | null> {
  const needsShaLock =
    (Array.isArray(input.addLinkedCommitShas) &&
      input.addLinkedCommitShas.length > 0) ||
    (Array.isArray(input.removeLinkedCommitShas) &&
      input.removeLinkedCommitShas.length > 0);

  const needsTxn =
    needsShaLock ||
    input.status !== undefined ||
    input.automateCompletion !== undefined;

  // Status / auto-review outbox must land in the same transaction (OS-92).
  if (needsTxn && executor === db) {
    return db.transaction((tx) =>
      updateTask(workspaceId, id, input, tx, actor, options),
    );
  }

  const existingQuery = executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  const [existing] = needsShaLock
    ? await existingQuery.for("update")
    : await existingQuery;
  if (!existing) {
    return null;
  }

  if (
    !taskPatchKeepsWaitingFollowUp({
      currentStatus: existing.status,
      currentFollowUpDate: existing.followUpDate?.toISOString() ?? null,
      nextStatus: input.status,
      nextFollowUpDate: input.followUpDate,
    })
  ) {
    throw new Error("WAITING_FOLLOW_UP_REQUIRED");
  }

  if (input.projectId) {
    const project = await getProjectById(workspaceId, input.projectId, executor);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }
  const executionLocationLocked = Boolean(existing.executionLocationLockedAt);
  if (
    input.executionLocation !== undefined &&
    executionLocationLocked
  ) {
    const next = input.executionLocation;
    const prev = existing.executionLocation ?? null;
    if (next !== prev) {
      throw new Error("EXECUTION_LOCATION_LOCKED");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.contactId,
    contacts,
    "CONTACT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.assigneeId,
    contacts,
    "ASSIGNEE_NOT_FOUND",
    executor,
  );
  const nextRelatedContactIds =
    input.relatedContactIds === undefined
      ? undefined
      : normalizeRelatedContactIds(input.relatedContactIds);
  if (nextRelatedContactIds !== undefined) {
    await assertRelatedContactIds(workspaceId, nextRelatedContactIds, executor);
  }
  const nextRelatedOrganizationIds =
    input.relatedOrganizationIds === undefined
      ? undefined
      : normalizeRelatedOrganizationIds(input.relatedOrganizationIds);
  if (nextRelatedOrganizationIds !== undefined) {
    await assertRelatedOrganizationIds(
      workspaceId,
      nextRelatedOrganizationIds,
      executor,
    );
  }
  const nextLinkedEmailIds =
    input.linkedEmailIds === undefined
      ? undefined
      : normalizeLinkedEmailIds(input.linkedEmailIds);
  const nextLabelIds =
    input.labelIds === undefined
      ? undefined
      : normalizeTaskLabelIds(input.labelIds);
  if (nextLabelIds !== undefined) {
    await assertTaskLabelIds(workspaceId, nextLabelIds, executor);
  }
  await assertWorkspaceReference(
    workspaceId,
    input.habitId,
    habits,
    "HABIT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.agentWorkingContactId,
    contacts,
    "AGENT_WORKING_CONTACT_NOT_FOUND",
    executor,
  );

  const nextStatus = input.status ?? existing.status;
  const nextProjectId =
    input.projectId === undefined ? existing.projectId : input.projectId;
  const nextContactId =
    input.contactId === undefined ? existing.contactId : input.contactId;
  const number =
    taskScope(nextProjectId, nextContactId) ===
    taskScope(existing.projectId, existing.contactId)
      ? existing.number
      : await nextTaskNumber(workspaceId, nextProjectId, nextContactId, executor);
  const writeAt = options?.updatedAt ?? new Date();
  const skipActivity = Boolean(options?.skipActivitySideEffects);
  const completedAt =
    nextStatus === "completed"
      ? existing.completedAt ?? writeAt
      : input.status && input.status !== "completed"
        ? null
        : existing.completedAt;

  let agentInboxApprovedAt = existing.agentInboxApprovedAt;
  if (
    input.agentInboxApproved === true &&
    options?.allowAgentInboxApproval &&
    existing.agentCreatedAt &&
    !existing.agentInboxApprovedAt
  ) {
    agentInboxApprovedAt = writeAt;
  } else if (
    input.agentInboxApprovedAt &&
    existing.agentCreatedAt &&
    !existing.agentInboxApprovedAt &&
    (options === undefined || options.allowAgentInboxApproval === true)
  ) {
    const parsed = new Date(input.agentInboxApprovedAt);
    if (!Number.isNaN(parsed.getTime())) {
      agentInboxApprovedAt = parsed;
    }
  }

  let inboxUpdatedAt: Date | null | undefined = undefined;
  if (
    shouldClearInboxUpdatedOnUserWrite(input) ||
    input.inboxUpdatedAt === null
  ) {
    inboxUpdatedAt = null;
  } else if (typeof input.inboxUpdatedAt === "string") {
    const parsed = new Date(input.inboxUpdatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      inboxUpdatedAt = parsed;
    }
  }

  const nextLinkedCommitShas = mergeLinkedCommitShas(
    existing.linkedCommitShas,
    input.linkedCommitShas,
    input.addLinkedCommitShas,
    input.removeLinkedCommitShas,
  );

  const existingKind =
    normalizeAgentWorkingKind(existing.agentWorkingKind) ??
    (existing.agentWorkingContactId ? "working" : null);
  const agentWorking = resolveAgentWorkingFields({
    existing: {
      contactId: existing.agentWorkingContactId ?? null,
      startedAt: existing.agentWorkingStartedAt ?? null,
      label: existing.agentWorkingLabel ?? null,
      kind: existingKind,
    },
    agentWorkingContactId: input.agentWorkingContactId,
    agentWorkingLabel: input.agentWorkingLabel,
    agentWorkingKind: input.agentWorkingKind,
    nextStatus,
    now: writeAt,
  });
  const agentWorkingChanged =
    agentWorking.contactId !== (existing.agentWorkingContactId ?? null) ||
    (agentWorking.startedAt?.getTime() ?? null) !==
      (existing.agentWorkingStartedAt?.getTime() ?? null) ||
    agentWorking.label !== (existing.agentWorkingLabel ?? null) ||
    agentWorking.kind !== existingKind;

  const [row] = await executor
    .update(tasks)
    .set({
      projectId: input.projectId,
      contactId: input.contactId,
      assigneeId: input.assigneeId,
      ...(nextRelatedContactIds !== undefined
        ? { relatedContactIds: nextRelatedContactIds }
        : {}),
      ...(nextRelatedOrganizationIds !== undefined
        ? { relatedOrganizationIds: nextRelatedOrganizationIds }
        : {}),
      ...(nextLinkedEmailIds !== undefined
        ? { linkedEmailIds: nextLinkedEmailIds }
        : {}),
      ...(nextLabelIds !== undefined ? { labelIds: nextLabelIds } : {}),
      number,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      sortOrder: input.sortOrder,
      dueDate:
        input.dueDate === undefined
          ? undefined
          : input.dueDate
            ? new Date(input.dueDate)
            : null,
      dueEndDate:
        input.dueEndDate === undefined
          ? undefined
          : input.dueEndDate
            ? new Date(input.dueEndDate)
            : null,
      followUpDate:
        input.followUpDate === undefined
          ? undefined
          : input.followUpDate
            ? new Date(input.followUpDate)
            : null,
      triagedAt:
        input.triagedAt === undefined
          ? undefined
          : input.triagedAt
            ? new Date(input.triagedAt)
            : null,
      inbox:
        input.inbox ??
        (input.projectId !== undefined || input.contactId !== undefined
          ? !nextProjectId && !nextContactId
          : undefined),
      support: input.support,
      notification: input.notification,
      ...(input.links !== undefined
        ? (() => {
            const links = normalizeTaskLinkUrls(input.links);
            const penpotDesign = resolveTaskPenpotDesignFields({
              links,
              penpotFileId: input.penpotFileId,
              penpotPageId: input.penpotPageId,
              penpotObjectId: input.penpotObjectId,
            });
            return {
              links,
              penpotFileId: penpotDesign.penpotFileId,
              penpotPageId: penpotDesign.penpotPageId,
              penpotObjectId: penpotDesign.penpotObjectId,
            };
          })()
        : {
            ...(input.penpotFileId !== undefined
              ? { penpotFileId: input.penpotFileId }
              : {}),
            ...(input.penpotPageId !== undefined
              ? { penpotPageId: input.penpotPageId }
              : {}),
            ...(input.penpotObjectId !== undefined
              ? { penpotObjectId: input.penpotObjectId }
              : {}),
          }),
      agentChatId: input.agentChatId,
      ...(input.executionLocation !== undefined && !executionLocationLocked
        ? {
            executionLocation: isExecutionLocation(input.executionLocation)
              ? input.executionLocation
              : null,
          }
        : {}),
      ...(input.lockExecutionLocation === true && !executionLocationLocked
        ? { executionLocationLockedAt: writeAt }
        : {}),
      ...(input.executionLocationLockedAt !== undefined &&
      options?.skipActivitySideEffects
        ? {
            executionLocationLockedAt: input.executionLocationLockedAt
              ? new Date(input.executionLocationLockedAt)
              : null,
          }
        : {}),
      ...(agentWorkingChanged
        ? {
            agentWorkingContactId: agentWorking.contactId,
            agentWorkingStartedAt: agentWorking.startedAt,
            agentWorkingLabel: agentWorking.label,
            agentWorkingKind: agentWorking.kind,
          }
        : {}),
      ...(nextLinkedCommitShas !== undefined
        ? { linkedCommitShas: nextLinkedCommitShas }
        : {}),
      ...(input.automateCompletion !== undefined
        ? { automateCompletion: input.automateCompletion }
        : {}),
      ...(input.autoReviewDeliveryStatus !== undefined
        ? { autoReviewDeliveryStatus: input.autoReviewDeliveryStatus }
        : {}),
      habitId: input.habitId,
      trackedMinutes: input.trackedMinutes,
      trackedDurationSeconds: input.trackedDurationSeconds,
      completedAt,
      agentInboxApprovedAt,
      ...(inboxUpdatedAt !== undefined ? { inboxUpdatedAt } : {}),
      updatedAt: writeAt,
    })
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)))
    .returning();

  if (row) {
    if (nextLabelIds !== undefined) {
      const previous = new Set(normalizeTaskLabelIds(existing.labelIds));
      const added = nextLabelIds.filter((labelId) => !previous.has(labelId));
      if (added.length > 0) {
        await touchTaskLabelsUsed(workspaceId, added, executor);
      }
    }
    if (!skipActivity) {
      if (input.status !== undefined && input.status !== existing.status) {
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "status_changed",
          { from: existing.status, to: input.status },
          actor,
          executor,
        );
        nudgeDynamicIslandTasksRefresh(
          `status:${existing.status}->${input.status}`,
        );
      }
      // Auto time tracking: start on in_progress, pause on leave — attribute
      // to the assignee contact so agent status flips never show as "Agent".
      // Ensure-start whenever the write sets `in_progress` (even if twin
      // replication already flipped the row) so leader-first local apply cannot
      // no-op the transition and skip the timer.
      if (input.status === "in_progress") {
        await taskActivityService.autoStartTaskTimerOnStatus(
          workspaceId,
          id,
          row.assigneeId,
          executor,
        );
      } else if (
        input.status !== undefined &&
        taskActivityService.shouldAutoStopTaskTimer(existing.status, input.status)
      ) {
        const stopped = await taskActivityService.autoStopTaskTimerOnStatus(
          workspaceId,
          id,
          row.assigneeId,
          executor,
        );
        if (
          stopped &&
          stopped.trackedDurationSeconds !== (row.trackedDurationSeconds ?? null)
        ) {
          row.trackedDurationSeconds = stopped.trackedDurationSeconds;
          row.trackedMinutes =
            stopped.trackedDurationSeconds != null &&
            stopped.trackedDurationSeconds >= 60
              ? Math.floor(stopped.trackedDurationSeconds / 60)
              : null;
        }
      }
      if (
        input.assigneeId !== undefined &&
        input.assigneeId !== existing.assigneeId
      ) {
        const [fromName, toName] = await Promise.all([
          contactDisplayName(workspaceId, existing.assigneeId, executor),
          contactDisplayName(workspaceId, input.assigneeId, executor),
        ]);
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "assignee_changed",
          {
            from: existing.assigneeId,
            to: input.assigneeId,
            fromName,
            toName,
          },
          actor,
          executor,
        );
      }
      if (nextRelatedContactIds !== undefined) {
        const existingRelated = normalizeRelatedContactIds(
          existing.relatedContactIds,
        );
        if (!relatedContactIdsEqual(existingRelated, nextRelatedContactIds)) {
          const [fromNames, toNames] = await Promise.all([
            relatedContactDisplayNames(workspaceId, existingRelated, executor),
            relatedContactDisplayNames(
              workspaceId,
              nextRelatedContactIds,
              executor,
            ),
          ]);
          await taskActivityService.recordTaskActivity(
            workspaceId,
            id,
            "related_contacts_changed",
            {
              from: existingRelated,
              to: nextRelatedContactIds,
              fromNames,
              toNames,
            },
            actor,
            executor,
          );
        }
      }
      if (nextRelatedOrganizationIds !== undefined) {
        const existingRelated = normalizeRelatedOrganizationIds(
          existing.relatedOrganizationIds,
        );
        if (
          !relatedOrganizationIdsEqual(
            existingRelated,
            nextRelatedOrganizationIds,
          )
        ) {
          const [fromNames, toNames] = await Promise.all([
            relatedOrganizationDisplayNames(
              workspaceId,
              existingRelated,
              executor,
            ),
            relatedOrganizationDisplayNames(
              workspaceId,
              nextRelatedOrganizationIds,
              executor,
            ),
          ]);
          await taskActivityService.recordTaskActivity(
            workspaceId,
            id,
            "related_organizations_changed",
            {
              from: existingRelated,
              to: nextRelatedOrganizationIds,
              fromNames,
              toNames,
            },
            actor,
            executor,
          );
        }
      }
      if (input.priority !== undefined && input.priority !== existing.priority) {
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "priority_changed",
          { from: existing.priority, to: input.priority },
          actor,
          executor,
        );
      }
      if (input.dueDate !== undefined) {
        const fromDue = dueDateIso(existing.dueDate);
        const toDue = dueDateIso(
          input.dueDate ? new Date(input.dueDate) : null,
        );
        if (fromDue !== toDue) {
          await taskActivityService.recordTaskActivity(
            workspaceId,
            id,
            "due_date_changed",
            { from: fromDue, to: toDue },
            actor,
            executor,
          );
        }
      }
      if (
        input.projectId !== undefined &&
        input.projectId !== existing.projectId
      ) {
        const [fromName, toName] = await Promise.all([
          projectDisplayName(workspaceId, existing.projectId, executor),
          projectDisplayName(workspaceId, input.projectId, executor),
        ]);
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "project_changed",
          {
            from: existing.projectId,
            to: input.projectId,
            fromName,
            toName,
          },
          actor,
          executor,
        );
      }
      if (
        input.automateCompletion !== undefined &&
        input.automateCompletion !== existing.automateCompletion
      ) {
        await taskActivityService.recordTaskActivity(
          workspaceId,
          id,
          "automate_completion_changed",
          {
            from: existing.automateCompletion,
            to: input.automateCompletion,
          },
          actor,
          executor,
        );
      }
    }
    await enqueueAutoReviewDelivery({
      workspaceId,
      task: row,
      previousStatus: existing.status,
      nextStatus: nextStatus,
      automateCompletion:
        input.automateCompletion ?? existing.automateCompletion,
      skipActivitySideEffects: skipActivity,
      timestamp: writeAt,
      executor,
    });
  }

  bumpAgentSearchCache(workspaceId);
  return row ?? null;
}

export async function deleteTask(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
      ),
    )
    .returning();
  if (row) bumpAgentSearchCache(workspaceId);
  return row ?? null;
}

export async function batchUpdateTasks(
  workspaceId: string,
  ids: string[],
  input: UpdateTaskInput,
  actor?: TaskWriteActor | null,
) {
  if (ids.length === 0) return [];
  return db.transaction(async (tx) => {
    const rows = [];
    for (const id of ids) {
      const row = await updateTask(workspaceId, id, input, tx, actor);
      if (row) rows.push(row);
    }
    return rows;
  });
}

export async function reorderTasks(
  workspaceId: string,
  orderedIds: string[],
) {
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.id, orderedIds),
          isNull(tasks.deletedAt),
        ),
      );
    if (owned.length !== new Set(orderedIds).size) throw new Error("TASK_NOT_FOUND");
    const rows = [];
    for (const [sortOrder, id] of orderedIds.entries()) {
      const [row] = await tx
        .update(tasks)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)))
        .returning();
      if (row) rows.push(row);
    }
    return rows;
  });
}
