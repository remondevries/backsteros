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

export function buildTaskRestPayload(
  taskId: string,
  body: Record<string, unknown>,
  options?: {
    agentInboxApproved?: boolean;
    allowAgentInboxApproval?: boolean;
  },
): Record<string, unknown> {
  const payload = restFieldsToSyncPayload(taskId, body, {
    jsonStringify: ["links"],
  });
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
  return restFieldsToSyncPayload(organizationId, body);
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
    jsonStringify: ["social_accounts"],
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
  return payload;
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

  return commitMutationsLeaderFirst({
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

  return commitMutationsLeaderFirst({
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
}
