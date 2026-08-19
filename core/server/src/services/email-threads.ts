import { and, eq } from "drizzle-orm";

import type {
  EmailThreadMetadata,
  UpdateEmailThreadMetadataInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { emailThreads, type DbEmailThread } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  getContactById,
  getOrganizationById,
} from "./circle-domain.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export function resolveEmailThreadKey(input: {
  threadId?: string | null;
  messageId: string;
}): string {
  const threadId = input.threadId?.trim();
  if (threadId) return threadId;
  return input.messageId.trim();
}

async function organizationExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const org = await getOrganizationById(workspaceId, id, executor);
  return Boolean(org);
}

async function contactExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const contact = await getContactById(workspaceId, id, executor);
  return Boolean(contact);
}

async function getEmailThreadRow(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.workspaceId, workspaceId),
        eq(emailThreads.inboxId, inboxId),
        eq(emailThreads.threadKey, threadKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function toEmailThreadMetadata(
  workspaceId: string,
  row: DbEmailThread,
): Promise<EmailThreadMetadata> {
  const [organization, contact, assignee] = await Promise.all([
    row.organizationId
      ? getOrganizationById(workspaceId, row.organizationId)
      : null,
    row.contactId ? getContactById(workspaceId, row.contactId) : null,
    row.assigneeId ? getContactById(workspaceId, row.assigneeId) : null,
  ]);
  return {
    id: row.id,
    inboxId: row.inboxId,
    threadKey: row.threadKey,
    organizationId: row.organizationId ?? null,
    organizationName: organization?.name ?? null,
    contactId: row.contactId ?? null,
    contactName: contact?.name ?? null,
    assigneeId: row.assigneeId ?? null,
    assigneeName: assignee?.name ?? null,
    status: row.status as EmailThreadMetadata["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrCreateEmailThreadMetadata(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  executor: DbExecutor = db,
): Promise<EmailThreadMetadata> {
  const existing = await getEmailThreadRow(
    workspaceId,
    inboxId,
    threadKey,
    executor,
  );
  if (existing) {
    return toEmailThreadMetadata(workspaceId, existing);
  }
  const id = newId();
  const [row] = await executor
    .insert(emailThreads)
    .values({
      id,
      workspaceId,
      inboxId,
      threadKey,
      status: "triage",
    })
    .returning();
  return toEmailThreadMetadata(workspaceId, row!);
}

export async function updateEmailThreadMetadata(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  input: UpdateEmailThreadMetadataInput,
  executor: DbExecutor = db,
): Promise<EmailThreadMetadata | null> {
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  if (
    input.contactId &&
    !(await contactExists(workspaceId, input.contactId, executor))
  ) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  if (
    input.assigneeId &&
    !(await contactExists(workspaceId, input.assigneeId, executor))
  ) {
    throw new Error("CONTACT_NOT_FOUND");
  }

  const existing = await getEmailThreadRow(
    workspaceId,
    inboxId,
    threadKey,
    executor,
  );
  const now = new Date();
  const patch = {
    organizationId:
      input.organizationId === undefined ? undefined : input.organizationId,
    contactId: input.contactId === undefined ? undefined : input.contactId,
    assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
    status: input.status,
    updatedAt: now,
  };

  if (existing) {
    const [row] = await executor
      .update(emailThreads)
      .set(patch)
      .where(eq(emailThreads.id, existing.id))
      .returning();
    return row ? toEmailThreadMetadata(workspaceId, row) : null;
  }

  const [row] = await executor
    .insert(emailThreads)
    .values({
      id: newId(),
      workspaceId,
      inboxId,
      threadKey,
      status: input.status ?? "triage",
      organizationId: input.organizationId ?? null,
      contactId: input.contactId ?? null,
      assigneeId: input.assigneeId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row ? toEmailThreadMetadata(workspaceId, row) : null;
}
