import type { SyncEntity, SyncOperation } from "../lib/sync-constants.js";
import {
  commitMutationsLeaderFirst,
  shouldForwardMutationsToLeader,
  type LeaderMutationChange,
  type LeaderMutationResult,
} from "./core-replication/leader-mutations.js";

export { shouldForwardMutationsToLeader as isRestLeaderFirstWrite };

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function restFieldsToSyncPayload(
  entityId: string,
  body: Record<string, unknown>,
  options?: {
    skipKeys?: string[];
    jsonStringify?: string[];
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: entityId };
  const skip = new Set(options?.skipKeys ?? ["activityActor", "agentInboxApproved"]);
  const jsonKeys = new Set(options?.jsonStringify ?? []);

  for (const [key, value] of Object.entries(body)) {
    if (skip.has(key) || value === undefined) continue;
    const snake = camelToSnake(key);
    if (jsonKeys.has(snake) && typeof value !== "string") {
      payload[snake] = JSON.stringify(value);
    } else {
      payload[snake] = value;
    }
  }
  return payload;
}

function applyAcknowledgeInboxUpdate(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
): void {
  if (body.acknowledgeInboxUpdate === true) {
    payload.inbox_updated_at = null;
    delete payload.acknowledge_inbox_update;
  }
}

export function buildTaskRestPayload(
  taskId: string,
  body: Record<string, unknown>,
  options?: {
    agentInboxApproved?: boolean;
    allowAgentInboxApproval?: boolean;
  },
): Record<string, unknown> {
  const payload = restFieldsToSyncPayload(taskId, body, {
    jsonStringify: ["links", "related_contact_ids", "related_organization_ids"],
  });
  applyAcknowledgeInboxUpdate(payload, body);
  if (
    options?.agentInboxApproved === true &&
    options.allowAgentInboxApproval
  ) {
    payload.agent_inbox_approved_at = new Date().toISOString();
  }
  return payload;
}

export function buildProjectRestPayload(
  projectId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(projectId, body);
}

export function buildOrganizationRestPayload(
  organizationId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(organizationId, body, {
    jsonStringify: ["social_accounts"],
  });
}

export function buildAreaRestPayload(
  areaId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(areaId, body);
}

export function buildContactRestPayload(
  contactId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(contactId, body, {
    jsonStringify: ["social_accounts", "emails", "phones", "languages", "portal_settings"],
    skipKeys: ["portalPassword", "activityActor", "agentInboxApproved"],
  });
}

export function buildLetterRestPayload(
  letterId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(letterId, body);
}

export function buildMeetingRestPayload(
  meetingId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const payload = restFieldsToSyncPayload(meetingId, body, {
    skipKeys: ["activityActor", "agentInboxApproved", "attendeeContactIds"],
  });
  if (Object.prototype.hasOwnProperty.call(body, "attendeeContactIds")) {
    payload.attendee_contact_ids = JSON.stringify(body.attendeeContactIds ?? []);
  }
  applyAcknowledgeInboxUpdate(payload, body);
  return payload;
}

export function buildContactRelationshipRestPayload(
  relationshipId: string,
  fromContactId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...restFieldsToSyncPayload(relationshipId, body),
    from_contact_id: fromContactId,
  };
}

export function buildCrmRelationshipLabelRestPayload(
  labelId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(labelId, body);
}

export function buildCrmGroupRestPayload(
  groupId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(groupId, body);
}

export function buildCrmGroupMemberRestPayload(
  memberId: string,
  groupId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...restFieldsToSyncPayload(memberId, body),
    group_id: groupId,
  };
}

export function buildCrmActivityRestPayload(
  activityId: string,
  subjectType: string,
  subjectId: string,
  body: Record<string, unknown>,
  createdBy?: string | null,
): Record<string, unknown> {
  const payload = restFieldsToSyncPayload(activityId, body);
  payload.subject_type = subjectType;
  payload.subject_id = subjectId;
  if (createdBy) payload.created_by = createdBy;
  return payload;
}

export function buildHabitRestPayload(
  habitId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(habitId, body);
}

export function buildBankAccountRestPayload(
  accountId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(accountId, body);
}

export function buildFinancialCategoryRestPayload(
  categoryId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(categoryId, body);
}

export function buildFinancialGoalRestPayload(
  goalId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(goalId, body);
}

export function buildFinancialRecurringRestPayload(
  recurringId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(recurringId, body);
}

export function buildCashflowPlannerRestPayload(
  entryId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(entryId, body);
}

export function buildFinancialTransactionRestPayload(
  transactionId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(transactionId, body);
}

export function buildEmailThreadRestPayload(
  threadId: string,
  inboxId: string,
  threadKey: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const payload = {
    ...restFieldsToSyncPayload(threadId, body),
    inbox_id: inboxId,
    thread_key: threadKey,
  };
  applyAcknowledgeInboxUpdate(payload, body);
  return payload;
}

export function buildRecurringTaskRestPayload(
  recurringTaskId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(recurringTaskId, body);
}

export function buildEmailThreadCommentRestPayload(
  commentId: string,
  inboxId: string,
  threadKey: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...restFieldsToSyncPayload(commentId, body, {
      skipKeys: ["activityActor", "agentInboxApproved"],
    }),
    inbox_id: inboxId,
    thread_key: threadKey,
  };
}

export function buildTaskCommentRestPayload(
  commentId: string,
  taskId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...restFieldsToSyncPayload(commentId, body, {
      skipKeys: ["activityActor", "agentInboxApproved"],
    }),
    task_id: taskId,
  };
}

export function buildTaskActivityRestPayload(
  activityId: string,
  taskId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...restFieldsToSyncPayload(activityId, body, {
      skipKeys: ["activityActor", "agentInboxApproved"],
      jsonStringify: ["data"],
    }),
    task_id: taskId,
  };
}

export function buildMentionRestPayload(
  mentionId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(mentionId, body);
}

export function buildWorkspaceSettingRestPayload(
  workspaceId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: workspaceId,
    settings,
  };
}

export function buildDocumentRestPayload(
  documentId: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return restFieldsToSyncPayload(documentId, body);
}

function newRestMutationId(
  entity: SyncEntity,
  entityId: string,
  operation: SyncOperation,
): string {
  return `rest:${entity}:${entityId}:${operation}:${Date.now()}:${crypto.randomUUID()}`;
}

/** Forward REST write to cloud leader and apply returned events locally. No local row write first. */
export async function commitRestEntityWrite(input: {
  workspaceId: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  mutationId?: string;
}): Promise<LeaderMutationResult> {
  const mutationId =
    input.mutationId ??
    newRestMutationId(input.entity, input.entityId, input.operation);

  const result = await commitMutationsLeaderFirst({
    workspaceId: input.workspaceId,
    mutationId,
    deviceId: "rest",
    changes: [
      {
        entity: input.entity,
        entityId: input.entityId,
        operation: input.operation,
        payload: input.payload,
        eventMutationId: mutationId,
      },
    ],
  });

  // Wake peer immediately (sync_events / table twin) — especially cloud→local.
  if (result.source !== "local_fallback") {
    const { notifyPeerOfEntityWrite } = await import(
      "./core-replication/nudge.js"
    );
    const taskIdFromPayload =
      typeof input.payload.task_id === "string"
        ? input.payload.task_id
        : typeof input.payload.taskId === "string"
          ? input.payload.taskId
          : null;
    notifyPeerOfEntityWrite({
      workspaceId: input.workspaceId,
      reason: "rest",
      entity: input.entity,
      entityId: input.entityId,
      taskId: taskIdFromPayload,
      operation: input.operation === "delete" ? "delete" : "upsert",
    });
  }

  return result;
}

/** Batch forward (reorder, batch update) as one leader mutation. */
export async function commitRestEntityWriteBatch(input: {
  workspaceId: string;
  changes: LeaderMutationChange[];
  mutationId?: string;
}): Promise<LeaderMutationResult> {
  const mutationId =
    input.mutationId ??
    `rest:batch:${Date.now()}:${crypto.randomUUID()}`;

  const result = await commitMutationsLeaderFirst({
    workspaceId: input.workspaceId,
    mutationId,
    deviceId: "rest",
    changes: input.changes.map((change, index) => ({
      ...change,
      eventMutationId:
        change.eventMutationId ??
        `${mutationId}:${change.entity}:${change.entityId}:${index}`,
    })),
  });

  if (result.source !== "local_fallback" && input.changes[0]) {
    const { notifyPeerOfEntityWrite } = await import(
      "./core-replication/nudge.js"
    );
    const first = input.changes[0];
    const taskIdFromPayload =
      typeof first.payload.task_id === "string"
        ? first.payload.task_id
        : typeof first.payload.taskId === "string"
          ? first.payload.taskId
          : null;
    notifyPeerOfEntityWrite({
      workspaceId: input.workspaceId,
      reason: "rest-batch",
      entity: first.entity,
      entityId: first.entityId,
      taskId: taskIdFromPayload,
      operation: first.operation === "delete" ? "delete" : "upsert",
    });
  }

  return result;
}
