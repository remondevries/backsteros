import { and, eq } from "drizzle-orm";

import {
  externalUpdateShouldSetInboxUpdated,
  statusQualifiesForInboxUpdatedFlag,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  emailThreads,
  meetings,
  tasks,
  type DbEmailThread,
  type DbMeeting,
  type DbTask,
} from "../db/schema.js";
import type { TaskWriteActor } from "../lib/write-actor.js";

type DbExecutor = Pick<typeof db, "select" | "update">;

export async function markTaskInboxUpdated(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<DbTask | null> {
  const [row] = await executor
    .update(tasks)
    .set({ inboxUpdatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)))
    .returning();
  return row ?? null;
}

export async function clearTaskInboxUpdated(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<DbTask | null> {
  const [row] = await executor
    .update(tasks)
    .set({ inboxUpdatedAt: null, updatedAt: new Date() })
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)))
    .returning();
  return row ?? null;
}

export async function markEmailThreadInboxUpdated(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  executor: DbExecutor = db,
): Promise<DbEmailThread | null> {
  const [row] = await executor
    .update(emailThreads)
    .set({ inboxUpdatedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(emailThreads.workspaceId, workspaceId),
        eq(emailThreads.inboxId, inboxId),
        eq(emailThreads.threadKey, threadKey),
      ),
    )
    .returning();
  return row ?? null;
}

export async function clearEmailThreadInboxUpdated(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  executor: DbExecutor = db,
): Promise<DbEmailThread | null> {
  const [row] = await executor
    .update(emailThreads)
    .set({ inboxUpdatedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(emailThreads.workspaceId, workspaceId),
        eq(emailThreads.inboxId, inboxId),
        eq(emailThreads.threadKey, threadKey),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markMeetingInboxUpdated(
  workspaceId: string,
  meetingId: string,
  executor: DbExecutor = db,
): Promise<DbMeeting | null> {
  const [row] = await executor
    .update(meetings)
    .set({ inboxUpdatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)))
    .returning();
  return row ?? null;
}

export async function clearMeetingInboxUpdated(
  workspaceId: string,
  meetingId: string,
  executor: DbExecutor = db,
): Promise<DbMeeting | null> {
  const [row] = await executor
    .update(meetings)
    .set({ inboxUpdatedAt: null, updatedAt: new Date() })
    .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)))
    .returning();
  return row ?? null;
}

export function shouldSetInboxUpdatedForExternalTaskActivity(input: {
  status: string;
  actor?: TaskWriteActor | null;
}): boolean {
  return externalUpdateShouldSetInboxUpdated({
    status: input.status,
    actorKind: input.actor?.kind ?? null,
  });
}

export function shouldSetInboxUpdatedForInboundEmail(status: string): boolean {
  return statusQualifiesForInboxUpdatedFlag(status);
}

export function shouldSetInboxUpdatedForExternalMeetingUpdate(input: {
  status: string;
  actor?: TaskWriteActor | null;
}): boolean {
  if (input.actor?.kind !== "contact") return false;
  const normalized = input.status.trim().toLowerCase();
  if (normalized === "triage") return false;
  return !["completed", "canceled", "duplicated"].includes(normalized);
}

export { shouldClearInboxUpdatedOnUserWrite } from "@backsteros/contracts";
