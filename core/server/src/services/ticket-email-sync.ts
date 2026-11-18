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
import {
  extractEmailAddress,
  isAutomatedMailSkipStatus,
} from "../lib/automated-mail.js";
import { ticketEmailTimelineCommentId } from "../lib/crypto.js";
import { isAgentMailOutboundMessage } from "../lib/email-status-labels.js";
import { toTaskComment } from "../lib/mappers.js";

export { extractEmailAddress, isAutomatedMailSkipStatus };
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

/**
 * Shared/public mailbox domains — never treat as "own" for outbound
 * classification. Only exact own addresses and custom owned domains count.
 */
export const SHARED_PUBLIC_EMAIL_DOMAINS = [
  "agentmail.to",
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "live.com",
  "yahoo.com",
  "proton.me",
  "protonmail.com",
] as const;

const SHARED_PUBLIC_EMAIL_DOMAIN_SET = new Set<string>(
  SHARED_PUBLIC_EMAIL_DOMAINS,
);

export function isSharedPublicEmailDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/^@/, "");
  return SHARED_PUBLIC_EMAIL_DOMAIN_SET.has(normalized);
}

function pushOwnDomain(ownDomains: string[], domain: string | undefined) {
  if (!domain) return;
  const normalized = domain.trim().toLowerCase().replace(/^@/, "");
  if (!normalized.includes(".")) return;
  if (isSharedPublicEmailDomain(normalized)) return;
  ownDomains.push(normalized);
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
 * owned custom domain, internal agent contact, or AgentMail `sent` label.
 *
 * Always classify by sender when `from` is present — an explicit direction
 * hint must not override own-address/domain checks (poll used to hard-code
 * inbound and win before the own-address check).
 */
export function resolveTicketEmailDirection(input: {
  from: string;
  explicit?: "inbound" | "outbound";
  inboxEmails?: Iterable<string>;
  ownEmails?: Iterable<string>;
  ownDomains?: Iterable<string>;
  labels?: readonly string[] | null;
}): "inbound" | "outbound" {
  if (isAgentMailOutboundMessage(input.labels)) return "outbound";

  const fromEmail = extractEmailAddress(input.from);
  if (fromEmail.includes("@")) {
    const inboxEmails = normalizeEmailSet(input.inboxEmails);
    const ownEmails = normalizeEmailSet(input.ownEmails);
    if (inboxEmails.has(fromEmail) || ownEmails.has(fromEmail)) {
      return "outbound";
    }

    const domain = fromEmail.split("@")[1] ?? "";
    const ownDomains = normalizeDomainSet(input.ownDomains);
    if (domain && ownDomains.has(domain) && !isSharedPublicEmailDomain(domain)) {
      return "outbound";
    }
    return "inbound";
  }

  // No usable From — fall back to an explicit hint only.
  if (input.explicit) return input.explicit;
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
        pushOwnDomain(ownDomains, email.split("@")[1]);
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
    pushOwnDomain(ownDomains, ownerEmail.split("@")[1]);
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
    headers: message.headers ?? null,
    // Direction is always re-resolved from sender at upsert time; leave unset
    // so an explicit hint cannot override own-address checks.
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

/**
 * OS-195 / OS-187: only a newly ingested genuine client reply may move ticket
 * status. Skip outbound/own mail, automated replies, and client mail that is
 * not newer than our last outbound (same floor as live retriage).
 */
export function shouldMoveStatusForMessage(input: {
  created: boolean;
  direction: "inbound" | "outbound";
  message: TicketEmailMessage;
  /** Latest outbound/`sent` message time on the thread (when known). */
  lastOutboundAt?: string | Date | number | null;
}): boolean {
  if (!input.created) return false;
  if (input.direction !== "inbound") return false;
  if (isAutomatedMailSkipStatus(input.message)) return false;
  const inboundAt = Date.parse(input.message.timestamp);
  if (Number.isNaN(inboundAt)) return false;
  if (input.lastOutboundAt != null && input.lastOutboundAt !== "") {
    const outboundAt =
      typeof input.lastOutboundAt === "number"
        ? input.lastOutboundAt
        : input.lastOutboundAt instanceof Date
          ? input.lastOutboundAt.getTime()
          : Date.parse(String(input.lastOutboundAt));
    if (!Number.isNaN(outboundAt) && inboundAt <= outboundAt) {
      return false;
    }
  }
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
  /**
   * Chronologically newest message across the linked thread(s) (created or
   * already present). Status moves only when that newest row is a genuine
   * client reply — not when an older inbound is newly linked after our outbound.
   */
  let newestOverall: {
    direction: "inbound" | "outbound";
    timestamp: string;
    message: TicketEmailMessage;
    created: boolean;
  } | null = null;
  /** Latest outbound on the thread (including already-synced rows). */
  let lastOutboundAt: string | null = null;
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
      if (direction === "outbound") {
        if (
          !lastOutboundAt ||
          new Date(message.timestamp).getTime() >
            new Date(lastOutboundAt).getTime()
        ) {
          lastOutboundAt = message.timestamp;
        }
      }
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
      const wasCreated = result.created;
      if (wasCreated) {
        created += 1;
        entries.push(toTaskComment(result.row));
      } else {
        skipped += 1;
      }
      if (
        !newestOverall ||
        new Date(message.timestamp).getTime() >
          new Date(newestOverall.timestamp).getTime()
      ) {
        newestOverall = {
          direction,
          timestamp: message.timestamp,
          message,
          created: wasCreated,
        };
      }
    }
  }

  // Only triage when the newest thread message is a real inbound client reply
  // (not outbound, not auto-reply/bounce, not older than our last outbound).
  if (
    newestOverall &&
    shouldMoveStatusForMessage({
      created: newestOverall.created,
      direction: newestOverall.direction,
      message: newestOverall.message,
      lastOutboundAt,
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

/**
 * Upgrade empty placeholders and preview-only bodies when a fuller message
 * arrives (poll snapshot → webhook/full fetch). Never shrink a longer body.
 */
export function needsTimelineBodyUpgrade(
  existingBody: string,
  nextBody: string,
): boolean {
  const existing = existingBody.trim();
  const next = nextBody.trim();
  if (!next || next === EMPTY_EMAIL_PLACEHOLDER) return false;
  if (existing === EMPTY_EMAIL_PLACEHOLDER) return true;
  if (existing === next) return false;
  return next.length > existing.length;
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
  /**
   * Hint only when From is missing. Sender classification always wins when
   * From is present — do not hard-code inbound on the poll/webhook path.
   */
  direction?: "inbound" | "outbound";
  /** Real message timestamp when known (list/webhook). */
  messageAt?: string | Date | number | null;
  /** Optional snapshot — skips AgentMail getThread when provided. */
  message?: Partial<TicketEmailMessage> | null;
  /**
   * Headers from a webhook/list payload when the body snapshot is incomplete.
   * Merged onto the resolved message so auto-reply skip still works after a
   * full thread fetch.
   */
  headers?: TicketEmailMessage["headers"];
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

  const snapshotProvided = Boolean(input.message?.messageId || input.message);
  const snapshotBody = snapshotProvided
    ? formatTimelineBody({
        messageId: input.messageId,
        threadId: thread.threadKey,
        from: input.message?.from ?? "",
        subject: input.message?.subject ?? "",
        preview: input.message?.preview ?? null,
        text: input.message?.text ?? null,
        timestamp: input.message?.timestamp ?? "",
      })
    : null;

  // Cheap re-poll guard: if every linked ticket already has this message and
  // none need a body upgrade, skip AgentMail entirely. When no snapshot is
  // provided (webhook), allow a full fetch so preview-only rows can upgrade.
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
    if (snapshotProvided) {
      if (
        snapshotBody &&
        needsTimelineBodyUpgrade(existing.body, snapshotBody)
      ) {
        anyNeedsWork = true;
      }
      continue;
    }
    // No list/webhook body snapshot: allow a full fetch to upgrade
    // preview-only rows (or fill placeholders). Bare re-polls without
    // headers/snapshot stay no-ops so we do not re-fetch forever.
    if (existing.body.trim() === EMPTY_EMAIL_PLACEHOLDER || input.headers) {
      anyNeedsWork = true;
    }
  }
  if (!anyNeedsWork) return;

  let messages: TicketEmailMessage[] = [];
  if (snapshotProvided) {
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
        // Never stamp an explicit direction from the poll/webhook hint —
        // classify by sender below.
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
      labels: input.message?.labels,
      headers: input.message?.headers,
    } satisfies TicketEmailMessage);

  if (fallbackTimestamp && (!message.timestamp || message.from === "")) {
    message.timestamp = message.timestamp || fallbackTimestamp;
  }
  if (!message.headers && input.headers) {
    message.headers = input.headers;
  } else if (!message.headers && input.message?.headers) {
    message.headers = input.message.headers;
  }

  // OS-195: header-less list/poll snapshots must fetch the full message before
  // status decisions so Auto-Submitted / X-Autoreply out-of-office never
  // bounce a ticket to Triage.
  if (!message.headers) {
    try {
      const fetched = await deps.fetchThreadMessages({
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        threadId: thread.threadKey,
      });
      const full =
        fetched.find((row) => row.messageId === input.messageId) ?? null;
      if (full?.headers) {
        message.headers = full.headers;
      }
      if (full?.from?.trim() && !message.from?.trim()) {
        message.from = full.from;
      }
      if (
        full &&
        needsTimelineBodyUpgrade(
          formatTimelineBody(message),
          formatTimelineBody(full),
        )
      ) {
        message.preview = full.preview ?? message.preview;
        message.text = full.text ?? message.text;
        message.subject = full.subject || message.subject;
        message.labels = full.labels ?? message.labels;
      }
    } catch (error) {
      console.warn(
        "[tickets] header-less list row fetch failed",
        input.inboxId,
        input.messageId,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const direction = resolveDirection(
    message.from,
    null,
    // Only use the caller hint when From is missing.
    message.from?.trim() ? undefined : input.direction,
    identity,
    message.labels,
  );

  for (const ticket of tickets) {
    const existing = existingByTicket.get(ticket.id);
    if (existing && !existing.deletedAt) {
      const nextBody = formatTimelineBody(message);
      if (!needsTimelineBodyUpgrade(existing.body, nextBody)) {
        // Already recorded — never re-triage on re-poll / body-upgrade skip.
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
