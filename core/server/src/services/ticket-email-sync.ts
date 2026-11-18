/**
 * OS-187: sync linked AgentMail messages into support-ticket timeline entries.
 * Idempotent on (task, email message id), including soft-deleted rows.
 * Never sends mail or notifies the client.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { TicketEmailSyncResult } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { emailThreads, tasks } from "../db/schema.js";
import {
  AgentMailClient,
  type AgentMailMessageDetail,
} from "../lib/agentmail-client.js";
import { ticketEmailTimelineCommentId } from "../lib/crypto.js";
import { toTaskComment } from "../lib/mappers.js";
import {
  getAgentMailCredentials,
  resolveInboxEmail,
} from "./agentmail-settings/settings.js";
import { lookupContactByChannel } from "./crm-domain/organizations-contacts.js";
import {
  getOrCreateEmailThreadMetadata,
  resolveEmailThreadKey,
} from "./email-threads.js";
import { upsertEmailTimelineComment } from "./task-comments.js";
import * as taskProjectService from "./tasks-projects.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

/** Task status used when a client reply reopens / retriages a linked ticket. */
export const TICKET_INBOUND_STATUS = "triage" as const;

export type TicketEmailMessage = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  preview: string | null;
  text: string | null;
  timestamp: string;
  direction?: "inbound" | "outbound";
};

export type TicketEmailSyncDeps = {
  fetchThreadMessages: (input: {
    workspaceId: string;
    inboxId: string;
    threadId: string;
  }) => Promise<TicketEmailMessage[]>;
  /** Test seam: must remain unused by production sync (no-send guarantee). */
  sendMail?: (...args: unknown[]) => Promise<unknown>;
  resolveContactIdByEmail?: (
    workspaceId: string,
    email: string,
  ) => Promise<string | null>;
};

function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  const raw = (match?.[1] ?? from).trim().toLowerCase();
  return raw.includes("@") ? raw : raw;
}

function resolveDirection(
  from: string,
  inboxEmail: string | null,
  explicit?: "inbound" | "outbound",
): "inbound" | "outbound" {
  if (explicit) return explicit;
  const fromEmail = extractEmailAddress(from);
  const ours = inboxEmail?.trim().toLowerCase() || null;
  if (ours && fromEmail && fromEmail === ours) return "outbound";
  return "inbound";
}

export function formatTimelineBody(message: TicketEmailMessage): string {
  const text = message.text?.trim() || message.preview?.trim() || "";
  const subject = message.subject?.trim();
  if (subject && text) return `**${subject}**\n\n${text}`;
  if (subject) return `**${subject}**`;
  return text || "(empty email)";
}

async function defaultResolveContactIdByEmail(
  workspaceId: string,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const row = await lookupContactByChannel(workspaceId, { email: normalized });
  return row?.id ?? null;
}

async function defaultFetchThreadMessages(input: {
  workspaceId: string;
  inboxId: string;
  threadId: string;
}): Promise<TicketEmailMessage[]> {
  const { apiKey } = await getAgentMailCredentials(input.workspaceId);
  if (!apiKey) return [];
  const client = new AgentMailClient({ apiKey });
  const thread = await client.getThread(input.inboxId, input.threadId);
  const inboxEmail = await resolveInboxEmail(client, input.inboxId);
  return (thread.messages ?? []).map((message: AgentMailMessageDetail) => ({
    messageId: message.messageId,
    threadId: message.threadId || input.threadId,
    from: message.from,
    subject: message.subject,
    preview: message.preview,
    text: message.text ?? message.extractedText,
    timestamp: message.timestamp,
    direction: resolveDirection(message.from, inboxEmail),
  }));
}

export const ticketEmailSyncDeps: TicketEmailSyncDeps = {
  fetchThreadMessages: defaultFetchThreadMessages,
  resolveContactIdByEmail: defaultResolveContactIdByEmail,
};

export async function listSupportTicketsForEmailThread(
  workspaceId: string,
  emailThreadId: string,
  executor: DbExecutor = db,
) {
  const rows = await executor
    .select({
      id: tasks.id,
      status: tasks.status,
      support: tasks.support,
      linkedEmailIds: tasks.linkedEmailIds,
      followUpDate: tasks.followUpDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.support, true),
        isNull(tasks.deletedAt),
        sql`${tasks.linkedEmailIds} @> ${JSON.stringify([emailThreadId])}::jsonb`,
      ),
    );
  return rows;
}

export async function resolveEmailThreadRowForAgentMail(input: {
  workspaceId: string;
  inboxId: string;
  threadId?: string | null;
  messageId?: string | null;
  createIfMissing?: boolean;
}) {
  const messageId = input.messageId?.trim() || "";
  const threadId = input.threadId?.trim() || "";
  if (!threadId && !messageId) return null;
  const threadKey = resolveEmailThreadKey({
    threadId: threadId || null,
    messageId: messageId || threadId,
  });
  if (!threadKey) return null;

  if (input.createIfMissing) {
    const meta = await getOrCreateEmailThreadMetadata(
      input.workspaceId,
      input.inboxId,
      threadKey,
    );
    return {
      id: meta.id,
      inboxId: meta.inboxId,
      threadKey: meta.threadKey,
      number: meta.number,
    };
  }

  const [row] = await db
    .select({
      id: emailThreads.id,
      inboxId: emailThreads.inboxId,
      threadKey: emailThreads.threadKey,
      number: emailThreads.number,
    })
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.workspaceId, input.workspaceId),
        eq(emailThreads.inboxId, input.inboxId),
        eq(emailThreads.threadKey, threadKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Apply ticket status from the latest synced message direction.
 * inbound (client reply) → triage from every status (including completed).
 * outbound (own mail) → never moves status (Remon 18 Nov).
 * Never sends mail.
 */
export async function applyTicketStatusFromEmailDirection(input: {
  workspaceId: string;
  taskId: string;
  direction: "inbound" | "outbound";
  currentStatus: string;
  currentFollowUpDate?: Date | string | null;
}): Promise<string | undefined> {
  // Own outgoing messages never move ticket status.
  if (input.direction === "outbound") {
    return undefined;
  }
  // Inbound client reply → Triage (reopens completed / canceled / etc.).
  if (input.currentStatus === TICKET_INBOUND_STATUS) {
    return undefined;
  }
  await taskProjectService.updateTask(input.workspaceId, input.taskId, {
    status: TICKET_INBOUND_STATUS,
  });
  return TICKET_INBOUND_STATUS;
}

/**
 * Author email timeline entries as the mail sender / matched CRM contact.
 * Never attributes client mail to the importing agent (`importerContactId` is
 * audit-only via importedByContactId on the caller).
 */
async function resolveEmailAuthor(input: {
  workspaceId: string;
  message: TicketEmailMessage;
  direction: "inbound" | "outbound";
  deps: TicketEmailSyncDeps;
}): Promise<{
  authorContactId: string | null;
  authorEmail: string | null;
  authorSide: "client" | "team";
}> {
  const authorSide = input.direction === "outbound" ? "team" : "client";
  const authorEmail = extractEmailAddress(input.message.from) || null;
  let authorContactId: string | null = null;
  if (authorEmail) {
    const resolve =
      input.deps.resolveContactIdByEmail ?? defaultResolveContactIdByEmail;
    authorContactId = await resolve(input.workspaceId, authorEmail);
  }
  return { authorContactId, authorEmail, authorSide };
}

export async function syncTicketLinkedEmails(input: {
  workspaceId: string;
  taskId: string;
  backfill?: boolean;
  activityActor?: "user" | "agent";
  authorContactId?: string | null;
  deps?: TicketEmailSyncDeps;
}): Promise<TicketEmailSyncResult | null> {
  // Hard no-send: never call deps.sendMail even if a test injects it.
  void input.deps?.sendMail;

  const [task] = await db
    .select({
      id: tasks.id,
      support: tasks.support,
      status: tasks.status,
      linkedEmailIds: tasks.linkedEmailIds,
      followUpDate: tasks.followUpDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, input.taskId),
        eq(tasks.workspaceId, input.workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task || !task.support) return null;

  const linkedIds = Array.isArray(task.linkedEmailIds)
    ? task.linkedEmailIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  if (linkedIds.length === 0) {
    return {
      ticketId: task.id,
      created: 0,
      skipped: 0,
      sentMail: false,
      entries: [],
    };
  }

  const threadRows = await db
    .select({
      id: emailThreads.id,
      inboxId: emailThreads.inboxId,
      threadKey: emailThreads.threadKey,
    })
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.workspaceId, input.workspaceId),
        inArray(emailThreads.id, linkedIds),
      ),
    );

  const deps = input.deps ?? ticketEmailSyncDeps;
  let created = 0;
  let skipped = 0;
  const entries = [];
  let latest: {
    direction: "inbound" | "outbound";
    timestamp: string;
  } | null = null;
  let currentStatus = task.status;

  for (const thread of threadRows) {
    let messages: TicketEmailMessage[] = [];
    try {
      messages = await deps.fetchThreadMessages({
        workspaceId: input.workspaceId,
        inboxId: thread.inboxId,
        threadId: thread.threadKey,
      });
    } catch (error) {
      console.warn(
        "[tickets] email sync fetch failed",
        thread.inboxId,
        thread.threadKey,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    for (const message of messages) {
      const direction = message.direction ?? "inbound";
      const author = await resolveEmailAuthor({
        workspaceId: input.workspaceId,
        message,
        direction,
        deps,
      });
      const result = await upsertEmailTimelineComment(input.workspaceId, {
        taskId: task.id,
        emailMessageId: message.messageId,
        body: formatTimelineBody(message),
        emailDirection: direction,
        emailSender: message.from,
        authorEmail: author.authorEmail,
        authorContactId: author.authorContactId,
        authorSide: author.authorSide,
        occurredAt: message.timestamp,
        visibility: "client_visible",
        imported: input.backfill === true,
        importedByContactId:
          input.backfill === true ? input.authorContactId ?? null : null,
        importedByActor:
          input.backfill === true
            ? input.activityActor === "user"
              ? "user"
              : "agent"
            : null,
        id: ticketEmailTimelineCommentId(
          input.workspaceId,
          task.id,
          message.messageId,
        ),
      });
      if (!result) continue;
      if (result.created) {
        created += 1;
        entries.push(toTaskComment(result.row));
      } else {
        skipped += 1;
      }
      if (
        !latest ||
        new Date(message.timestamp).getTime() >
          new Date(latest.timestamp).getTime()
      ) {
        latest = { direction, timestamp: message.timestamp };
      }
    }
  }

  if (latest) {
    const nextStatus = await applyTicketStatusFromEmailDirection({
      workspaceId: input.workspaceId,
      taskId: task.id,
      direction: latest.direction,
      currentStatus,
      currentFollowUpDate: task.followUpDate,
    });
    if (nextStatus) currentStatus = nextStatus;
  }

  return {
    ticketId: task.id,
    created,
    skipped,
    status: currentStatus as TicketEmailSyncResult["status"],
    sentMail: false,
    entries,
  };
}

/**
 * Live auto-sync for one inbound/outbound message onto all linked support tickets.
 * Fire-and-forget safe. Never sends mail.
 */
export async function syncLinkedTicketsForEmailMessage(input: {
  workspaceId: string;
  inboxId: string;
  messageId: string;
  threadId?: string | null;
  direction: "inbound" | "outbound";
  deps?: TicketEmailSyncDeps;
}): Promise<void> {
  void input.deps?.sendMail;

  const thread = await resolveEmailThreadRowForAgentMail({
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    threadId: input.threadId,
    messageId: input.messageId,
    createIfMissing: false,
  });
  if (!thread) return;

  const tickets = await listSupportTicketsForEmailThread(
    input.workspaceId,
    thread.id,
  );
  if (tickets.length === 0) return;

  const deps = input.deps ?? ticketEmailSyncDeps;
  let messages: TicketEmailMessage[] = [];
  try {
    messages = await deps.fetchThreadMessages({
      workspaceId: input.workspaceId,
      inboxId: input.inboxId,
      threadId: thread.threadKey,
    });
  } catch (error) {
    console.warn(
      "[tickets] live email sync fetch failed",
      input.inboxId,
      input.messageId,
      error instanceof Error ? error.message : error,
    );
    return;
  }

  const message =
    messages.find((row) => row.messageId === input.messageId) ??
    ({
      messageId: input.messageId,
      threadId: thread.threadKey,
      from: "",
      subject: "",
      preview: null,
      text: null,
      timestamp: new Date().toISOString(),
      direction: input.direction,
    } satisfies TicketEmailMessage);

  const direction = message.direction ?? input.direction;

  for (const ticket of tickets) {
    const author = await resolveEmailAuthor({
      workspaceId: input.workspaceId,
      message,
      direction,
      deps,
    });
    await upsertEmailTimelineComment(input.workspaceId, {
      taskId: ticket.id,
      emailMessageId: message.messageId,
      body: formatTimelineBody(message),
      emailDirection: direction,
      emailSender: message.from || null,
      authorEmail: author.authorEmail,
      authorContactId: author.authorContactId,
      authorSide: author.authorSide,
      occurredAt: message.timestamp,
      visibility: "client_visible",
      imported: false,
      id: ticketEmailTimelineCommentId(
        input.workspaceId,
        ticket.id,
        message.messageId,
      ),
    });
    await applyTicketStatusFromEmailDirection({
      workspaceId: input.workspaceId,
      taskId: ticket.id,
      direction,
      currentStatus: ticket.status,
      currentFollowUpDate: ticket.followUpDate,
    });
  }
}
