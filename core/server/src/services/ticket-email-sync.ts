/**
 * OS-187: sync linked AgentMail messages into support-ticket timeline entries.
 * Idempotent on (task, email message id), including soft-deleted rows.
 * Never sends mail or notifies the client.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { TicketEmailSyncResult } from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  apiKeys,
  contacts,
  emailThreads,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import {
  AgentMailClient,
  type AgentMailMessageDetail,
} from "../lib/agentmail-client.js";
import { ticketEmailTimelineCommentId } from "../lib/crypto.js";
import { isAgentMailOutboundMessage } from "../lib/email-status-labels.js";
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
import {
  findTaskCommentByEmailMessageId,
  upsertEmailTimelineComment,
} from "./task-comments.js";
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
  labels?: string[];
  headers?: Array<{ name: string; value: string }> | Record<string, string> | null;
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
  resolveOutboundIdentity?: (
    workspaceId: string,
  ) => Promise<TicketOutboundIdentity>;
};

export type TicketOutboundIdentity = {
  inboxEmails: string[];
  ownEmails: string[];
  ownDomains: string[];
};

export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  const raw = (match?.[1] ?? from).trim().toLowerCase();
  return raw.includes("@") ? raw : raw;
}

function headerMap(
  headers:
    | Array<{ name: string; value: string }>
    | Record<string, string>
    | null
    | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!headers) return out;
  if (Array.isArray(headers)) {
    for (const row of headers) {
      const name = row.name?.trim().toLowerCase();
      if (!name) continue;
      out.set(name, row.value ?? "");
    }
    return out;
  }
  for (const [name, value] of Object.entries(headers)) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    out.set(key, value ?? "");
  }
  return out;
}

/**
 * Auto-replies and bounces must not move ticket status.
 * Checks Auto-Submitted, X-Autoreply/X-Autorespond, Precedence, and
 * mailer-daemon/postmaster senders.
 */
export function isAutomatedMailSkipStatus(input: {
  from: string;
  headers?: TicketEmailMessage["headers"];
}): boolean {
  const fromEmail = extractEmailAddress(input.from);
  const local = fromEmail.split("@")[0] ?? "";
  if (
    local === "mailer-daemon" ||
    local === "postmaster" ||
    local.startsWith("mailer-daemon+") ||
    local.startsWith("postmaster+")
  ) {
    return true;
  }

  const headers = headerMap(input.headers);
  const autoSubmitted = headers.get("auto-submitted")?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers.has("x-autoreply") || headers.has("x-autorespond")) return true;
  const precedence = headers.get("precedence")?.trim().toLowerCase();
  if (
    precedence === "bulk" ||
    precedence === "auto_reply" ||
    precedence === "junk"
  ) {
    return true;
  }
  return false;
}

function normalizeEmailSet(values: Iterable<string> | undefined): Set<string> {
  const out = new Set<string>();
  if (!values) return out;
  for (const value of values) {
    const email = extractEmailAddress(value);
    if (email.includes("@")) out.add(email);
  }
  return out;
}

function normalizeDomainSet(values: Iterable<string> | undefined): Set<string> {
  const out = new Set<string>();
  if (!values) return out;
  for (const value of values) {
    const domain = value.trim().toLowerCase().replace(/^@/, "");
    if (domain.includes(".")) out.add(domain);
  }
  return out;
}

/**
 * Outbound when the sender is a workspace inbox, Remon/owner address,
 * workspace domain, internal agent contact, or AgentMail `sent` label.
 */
export function resolveTicketEmailDirection(input: {
  from: string;
  explicit?: "inbound" | "outbound";
  inboxEmails?: Iterable<string>;
  ownEmails?: Iterable<string>;
  ownDomains?: Iterable<string>;
  labels?: readonly string[] | null;
}): "inbound" | "outbound" {
  if (input.explicit) return input.explicit;
  if (isAgentMailOutboundMessage(input.labels)) return "outbound";

  const fromEmail = extractEmailAddress(input.from);
  if (!fromEmail.includes("@")) return "inbound";

  const inboxEmails = normalizeEmailSet(input.inboxEmails);
  const ownEmails = normalizeEmailSet(input.ownEmails);
  if (inboxEmails.has(fromEmail) || ownEmails.has(fromEmail)) {
    return "outbound";
  }

  const domain = fromEmail.split("@")[1] ?? "";
  const ownDomains = normalizeDomainSet(input.ownDomains);
  if (domain && ownDomains.has(domain)) return "outbound";

  return "inbound";
}

/** @deprecated Prefer {@link resolveTicketEmailDirection}. */
function resolveDirection(
  from: string,
  inboxEmail: string | null,
  explicit?: "inbound" | "outbound",
  identity?: TicketOutboundIdentity | null,
  labels?: readonly string[] | null,
): "inbound" | "outbound" {
  return resolveTicketEmailDirection({
    from,
    explicit,
    inboxEmails: [
      ...(inboxEmail ? [inboxEmail] : []),
      ...(identity?.inboxEmails ?? []),
    ],
    ownEmails: identity?.ownEmails,
    ownDomains: identity?.ownDomains,
    labels,
  });
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

async function defaultResolveOutboundIdentity(
  workspaceId: string,
): Promise<TicketOutboundIdentity> {
  const inboxEmails: string[] = [];
  const ownEmails: string[] = [];
  const ownDomains: string[] = [];

  try {
    const { apiKey } = await getAgentMailCredentials(workspaceId);
    if (apiKey) {
      const client = new AgentMailClient({ apiKey });
      const inboxes = await client.listInboxes({ limit: 100 });
      for (const inbox of inboxes) {
        const email = inbox.email?.trim().toLowerCase();
        if (!email || !email.includes("@")) continue;
        inboxEmails.push(email);
        ownEmails.push(email);
        const domain = email.split("@")[1];
        if (domain) ownDomains.push(domain);
      }
    }
  } catch {
    // Keep sync working when AgentMail is unreachable.
  }

  const [owner] = await db
    .select({ email: users.email })
    .from(workspaces)
    .innerJoin(users, eq(users.id, workspaces.ownerUserId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const ownerEmail = owner?.email?.trim().toLowerCase();
  if (ownerEmail?.includes("@")) {
    ownEmails.push(ownerEmail);
    const domain = ownerEmail.split("@")[1];
    if (domain) ownDomains.push(domain);
  }

  // Agent persona contacts (API keys attached to a contact).
  const agentRows = await db
    .select({ email: contacts.email })
    .from(apiKeys)
    .innerJoin(contacts, eq(contacts.id, apiKeys.contactId))
    .where(
      and(
        eq(apiKeys.workspaceId, workspaceId),
        isNull(apiKeys.revokedAt),
        isNull(contacts.deletedAt),
      ),
    );
  for (const row of agentRows) {
    const email = row.email?.trim().toLowerCase();
    if (email?.includes("@")) ownEmails.push(email);
  }

  return {
    inboxEmails: [...new Set(inboxEmails)],
    ownEmails: [...new Set(ownEmails)],
    ownDomains: [...new Set(ownDomains)],
  };
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
  const identity = await defaultResolveOutboundIdentity(input.workspaceId);
  return (thread.messages ?? []).map((message: AgentMailMessageDetail) => ({
    messageId: message.messageId,
    threadId: message.threadId || input.threadId,
    from: message.from,
    subject: message.subject,
    preview: message.preview,
    text: message.text ?? message.extractedText,
    timestamp: message.timestamp,
    labels: message.labels,
    direction: resolveDirection(
      message.from,
      inboxEmail,
      undefined,
      identity,
      message.labels,
    ),
  }));
}

export const ticketEmailSyncDeps: TicketEmailSyncDeps = {
  fetchThreadMessages: defaultFetchThreadMessages,
  resolveContactIdByEmail: defaultResolveContactIdByEmail,
  resolveOutboundIdentity: defaultResolveOutboundIdentity,
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

function shouldMoveStatusForMessage(input: {
  created: boolean;
  direction: "inbound" | "outbound";
  message: TicketEmailMessage;
}): boolean {
  if (!input.created) return false;
  if (input.direction !== "inbound") return false;
  if (isAutomatedMailSkipStatus(input.message)) return false;
  return true;
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
  const resolveIdentity =
    deps.resolveOutboundIdentity ?? defaultResolveOutboundIdentity;
  const identity = await resolveIdentity(input.workspaceId);
  let created = 0;
  let skipped = 0;
  const entries = [];
  /** Chronologically latest newly-created message in this run (status gate). */
  let newestCreated: {
    direction: "inbound" | "outbound";
    timestamp: string;
    message: TicketEmailMessage;
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
      const direction = resolveDirection(
        message.from,
        null,
        message.direction,
        identity,
        message.labels,
      );
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
        if (
          !newestCreated ||
          new Date(message.timestamp).getTime() >
            new Date(newestCreated.timestamp).getTime()
        ) {
          newestCreated = {
            direction,
            timestamp: message.timestamp,
            message,
          };
        }
      } else {
        skipped += 1;
      }
    }
  }

  // Only triage when the newest newly-created message is a real inbound
  // (not outbound, not auto-reply/bounce, not placeholder replacement).
  if (
    newestCreated &&
    shouldMoveStatusForMessage({
      created: true,
      direction: newestCreated.direction,
      message: newestCreated.message,
    })
  ) {
    const nextStatus = await applyTicketStatusFromEmailDirection({
      workspaceId: input.workspaceId,
      taskId: task.id,
      direction: "inbound",
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

const EMPTY_EMAIL_PLACEHOLDER = "(empty email)";

function needsPlaceholderReplace(
  existingBody: string,
  nextBody: string,
): boolean {
  return (
    existingBody.trim() === EMPTY_EMAIL_PLACEHOLDER &&
    nextBody.trim().length > 0 &&
    nextBody.trim() !== EMPTY_EMAIL_PLACEHOLDER
  );
}

/**
 * Live auto-sync for one inbound/outbound message onto all linked support tickets.
 * Fire-and-forget safe. Never sends mail.
 *
 * Pass `message` (list/webhook snapshot) to avoid fetching the whole AgentMail
 * thread when the payload is already known. Re-polls of an already-recorded
 * message id no-op without a thread fetch and never move status.
 */
export async function syncLinkedTicketsForEmailMessage(input: {
  workspaceId: string;
  inboxId: string;
  messageId: string;
  threadId?: string | null;
  direction: "inbound" | "outbound";
  /** Real message timestamp when known (list/webhook). */
  messageAt?: string | Date | number | null;
  /** Optional snapshot — skips AgentMail getThread when provided. */
  message?: Partial<TicketEmailMessage> | null;
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
  const resolveIdentity =
    deps.resolveOutboundIdentity ?? defaultResolveOutboundIdentity;
  const identity = await resolveIdentity(input.workspaceId);

  // Cheap re-poll guard: if every linked ticket already has this message and
  // none need placeholder replacement, skip AgentMail entirely.
  let anyNeedsWork = false;
  const existingByTicket = new Map<
    string,
    Awaited<ReturnType<typeof findTaskCommentByEmailMessageId>>
  >();
  for (const ticket of tickets) {
    const existing = await findTaskCommentByEmailMessageId(
      input.workspaceId,
      input.messageId,
      db,
      { taskId: ticket.id, includeDeleted: true },
    );
    existingByTicket.set(ticket.id, existing);
    if (!existing || existing.deletedAt) {
      anyNeedsWork = true;
      continue;
    }
    if (existing.body.trim() === EMPTY_EMAIL_PLACEHOLDER) {
      anyNeedsWork = true;
    }
  }
  if (!anyNeedsWork) return;

  let messages: TicketEmailMessage[] = [];
  if (input.message?.messageId || input.message) {
    const atMs =
      input.messageAt instanceof Date
        ? input.messageAt.getTime()
        : typeof input.messageAt === "number"
          ? input.messageAt
          : typeof input.messageAt === "string"
            ? Date.parse(input.messageAt)
            : Number.NaN;
    const timestamp =
      input.message?.timestamp?.trim() ||
      (Number.isFinite(atMs) ? new Date(atMs).toISOString() : "");
    messages = [
      {
        messageId: input.messageId,
        threadId: thread.threadKey,
        from: input.message?.from ?? "",
        subject: input.message?.subject ?? "",
        preview: input.message?.preview ?? null,
        text: input.message?.text ?? null,
        timestamp: timestamp || new Date().toISOString(),
        direction: input.message?.direction ?? input.direction,
        labels: input.message?.labels,
        headers: input.message?.headers,
      },
    ];
  } else {
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
  }

  const atMs =
    input.messageAt instanceof Date
      ? input.messageAt.getTime()
      : typeof input.messageAt === "number"
        ? input.messageAt
        : typeof input.messageAt === "string"
          ? Date.parse(input.messageAt)
          : Number.NaN;
  const fallbackTimestamp = Number.isFinite(atMs)
    ? new Date(atMs).toISOString()
    : null;

  const message =
    messages.find((row) => row.messageId === input.messageId) ??
    ({
      messageId: input.messageId,
      threadId: thread.threadKey,
      from: input.message?.from ?? "",
      subject: input.message?.subject ?? "",
      preview: input.message?.preview ?? null,
      text: input.message?.text ?? null,
      timestamp: fallbackTimestamp ?? new Date().toISOString(),
      direction: input.direction,
      labels: input.message?.labels,
      headers: input.message?.headers,
    } satisfies TicketEmailMessage);

  if (fallbackTimestamp && (!message.timestamp || message.from === "")) {
    message.timestamp = message.timestamp || fallbackTimestamp;
  }

  const direction = resolveDirection(
    message.from,
    null,
    message.direction ?? input.direction,
    identity,
    message.labels,
  );

  for (const ticket of tickets) {
    const existing = existingByTicket.get(ticket.id);
    if (existing && !existing.deletedAt) {
      const nextBody = formatTimelineBody(message);
      if (!needsPlaceholderReplace(existing.body, nextBody)) {
        // Already recorded — never re-triage on re-poll / placeholder skip.
        continue;
      }
    }

    const author = await resolveEmailAuthor({
      workspaceId: input.workspaceId,
      message,
      direction,
      deps,
    });
    const result = await upsertEmailTimelineComment(input.workspaceId, {
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
    if (
      result &&
      shouldMoveStatusForMessage({
        created: result.created,
        direction,
        message,
      })
    ) {
      await applyTicketStatusFromEmailDirection({
        workspaceId: input.workspaceId,
        taskId: ticket.id,
        direction,
        currentStatus: ticket.status,
        currentFollowUpDate: ticket.followUpDate,
      });
    }
  }
}
