/**
 * Chat display layout for mention tokens: every kind except `contact` and
 * `organization` renders once as a full card below the bubble. Matching tokens
 * are stripped from the bubble text so they never also appear as inline chips.
 * Contact and organization mentions stay inline as name chips.
 */
import type {
  ChatUiCardPart,
  ChatUiMessage,
  ChatUiMessagePart,
  ChatUiTaskCardData,
} from "@backsteros/contracts";

import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import {
  resolveMentionCatalogDocument,
  resolveMentionCatalogEmail,
  resolveMentionCatalogEstimate,
  resolveMentionCatalogHabit,
  resolveMentionCatalogInvoice,
  resolveMentionCatalogJournal,
  resolveMentionCatalogLetter,
  resolveMentionCatalogMeeting,
  resolveMentionCatalogMessage,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogPost,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
  resolveMentionCatalogTransaction,
} from "../mentions/resolve-catalog-entry.js";
import { resolveMentionHref } from "../mentions/tokens.js";
import {
  mentionTokenLabel,
  parseMentionToken,
  segmentMarkdownWithMentions,
  type MentionKind,
  type ParsedMentionToken,
} from "../mentions/mention-tokens.js";
import { parseTaskSlug } from "../navigation/resolve-history-entry-display.js";
import { getScopedProjectTaskHref } from "../projects/project-route-scope.js";
import { getInboxTaskRouteHref } from "../inbox/inbox-items.js";
import { INBOX_TASK_KEY } from "../tasks/task-display-id.js";

/** Mentions that stay as inline name chips — never below-card / never stripped. */
export const CHAT_INLINE_MENTION_KINDS = new Set<MentionKind>([
  "contact",
  "organization",
]);

function isInlineChatCardType(cardType: string): boolean {
  return cardType === "contact" || cardType === "organization";
}

export function isChatBelowCardMentionKind(kind: MentionKind): boolean {
  return !CHAT_INLINE_MENTION_KINDS.has(kind);
}

export type ChatMentionBelowCard = {
  /** Stable React key / dedupe id (`kind:id`, lowercased). */
  key: string;
  part: ChatUiCardPart;
  /**
   * True when we only have a stub (mention token) and have not resolved
   * workspace/catalog data yet — UI may show a looking-up state.
   */
  unresolved: boolean;
};

/** @deprecated Use {@link ChatMentionBelowCard}. */
export type ChatTaskBelowCard = ChatMentionBelowCard;

type MentionSlot = {
  key: string;
  token: ParsedMentionToken | null;
  cardPart: ChatUiCardPart | null;
};

/** Dedupe key `kind:id` for below-card mentions; null for inline kinds / invalid. */
export function mentionDedupeKey(token: ParsedMentionToken): string | null {
  if (!isChatBelowCardMentionKind(token.kind)) return null;
  switch (token.kind) {
    case "task":
    case "letter":
    case "email":
    case "meeting":
      return `${token.kind}:${token.displayId.trim().toLowerCase()}`;
    case "project":
    case "organization":
      return `${token.kind}:${token.key.trim().toLowerCase()}`;
    case "document":
      return `document:${token.projectKey.trim().toLowerCase()}/${token.relativePath
        .trim()
        .toLowerCase()}`;
    case "journal":
      return `journal:${token.date}`;
    case "habit":
      return token.date
        ? `habit:${token.habitId.trim().toLowerCase()}/${token.date}`
        : `habit:${token.habitId.trim().toLowerCase()}`;
    case "message":
    case "post":
    case "transaction":
    case "invoice":
    case "estimate":
      return `${token.kind}:${token.id.trim().toLowerCase()}`;
    default:
      return null;
  }
}

function asCardPart(part: ChatUiMessagePart): ChatUiCardPart | null {
  if (part.type !== "card") return null;
  return part;
}

function stringField(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Dedupe key from an explicit card part; null for inline kinds / unkeyable. */
export function cardPartDedupeKey(part: ChatUiCardPart): string | null {
  if (isInlineChatCardType(part.cardType)) return null;
  const data = part.data;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const kind = part.cardType;

  switch (kind) {
    case "task": {
      const displayId = stringField(record, "displayId");
      const taskId = stringField(record, "taskId");
      if (displayId) return `task:${displayId.toLowerCase()}`;
      if (taskId) return `task:${taskId.toLowerCase()}`;
      return null;
    }
    case "project": {
      const key = stringField(record, "key");
      const projectId = stringField(record, "projectId");
      if (key) return `project:${key.toLowerCase()}`;
      if (projectId) return `project:${projectId.toLowerCase()}`;
      return null;
    }
    case "organization": {
      const key = stringField(record, "key");
      const organizationId = stringField(record, "organizationId");
      if (key) return `organization:${key.toLowerCase()}`;
      if (organizationId) return `organization:${organizationId.toLowerCase()}`;
      return null;
    }
    case "document": {
      const projectKey = stringField(record, "projectKey");
      const relativePath = stringField(record, "relativePath");
      const documentId = stringField(record, "documentId");
      if (projectKey && relativePath) {
        return `document:${projectKey.toLowerCase()}/${relativePath.toLowerCase()}`;
      }
      if (documentId) return `document:${documentId.toLowerCase()}`;
      return null;
    }
    case "letter": {
      const displayId = stringField(record, "displayId");
      const letterId = stringField(record, "letterId");
      if (displayId) return `letter:${displayId.toLowerCase()}`;
      if (letterId) return `letter:${letterId.toLowerCase()}`;
      return null;
    }
    case "email": {
      const displayId = stringField(record, "displayId");
      const emailId = stringField(record, "emailId");
      if (displayId) return `email:${displayId.toLowerCase()}`;
      if (emailId) return `email:${emailId.toLowerCase()}`;
      return null;
    }
    case "meeting": {
      const displayId = stringField(record, "displayId");
      const meetingId = stringField(record, "meetingId");
      if (displayId) return `meeting:${displayId.toLowerCase()}`;
      if (meetingId) return `meeting:${meetingId.toLowerCase()}`;
      return null;
    }
    case "journal": {
      const date = stringField(record, "date");
      return date ? `journal:${date}` : null;
    }
    case "habit": {
      const habitId = stringField(record, "habitId");
      if (!habitId) return null;
      const date = stringField(record, "date");
      return date
        ? `habit:${habitId.toLowerCase()}/${date}`
        : `habit:${habitId.toLowerCase()}`;
    }
    case "message": {
      const id = stringField(record, "conversationId");
      return id ? `message:${id.toLowerCase()}` : null;
    }
    case "post": {
      const id = stringField(record, "postId");
      return id ? `post:${id.toLowerCase()}` : null;
    }
    case "transaction": {
      const id = stringField(record, "transactionId");
      return id ? `transaction:${id.toLowerCase()}` : null;
    }
    case "invoice": {
      const id = stringField(record, "invoiceId");
      return id ? `invoice:${id.toLowerCase()}` : null;
    }
    case "estimate": {
      const id = stringField(record, "estimateId");
      return id ? `estimate:${id.toLowerCase()}` : null;
    }
    case "generic": {
      const kindField = stringField(record, "kind");
      const ref = stringField(record, "ref");
      if (kindField && ref) return `${kindField}:${ref.toLowerCase()}`;
      return null;
    }
    default:
      return null;
  }
}

function taskDataFromCardPart(
  part: ChatUiCardPart,
): ChatUiTaskCardData | null {
  const data = part.data;
  if (!data || typeof data !== "object") return null;
  const taskId = (data as { taskId?: unknown }).taskId;
  if (typeof taskId !== "string" || !taskId.trim()) return null;
  return data as ChatUiTaskCardData;
}

/** Href guess from `OS-144` / `IN-12` when catalog lookup missed. */
export function hrefFromTaskDisplayId(displayId: string): string | undefined {
  const slug = parseTaskSlug(displayId);
  if (!slug) return undefined;
  if (slug.contextKey.toUpperCase() === INBOX_TASK_KEY) {
    return getInboxTaskRouteHref({ number: slug.number });
  }
  return getScopedProjectTaskHref(slug.contextKey, slug.number);
}

function hrefGuessFromToken(token: ParsedMentionToken): string | undefined {
  switch (token.kind) {
    case "task":
      return hrefFromTaskDisplayId(token.displayId);
    case "project":
      return `/projects/${encodeURIComponent(token.key)}`;
    case "organization":
      return `/organizations/${encodeURIComponent(token.key)}`;
    case "document":
      return `/documents/${encodeURIComponent(token.projectKey)}/${token.relativePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
    case "letter":
      return `/letters/${encodeURIComponent(token.displayId)}`;
    case "email":
      return undefined;
    case "meeting":
      return `/calendar/meetings/${encodeURIComponent(token.displayId)}`;
    case "journal":
      return `/journal/${encodeURIComponent(token.date)}`;
    case "habit":
      return token.date
        ? `/journal/habits/${encodeURIComponent(token.habitId)}?date=${encodeURIComponent(token.date)}`
        : `/journal/habits/${encodeURIComponent(token.habitId)}`;
    case "message":
      return `/communication/${encodeURIComponent(token.id)}`;
    case "post":
      return `/social/post/${encodeURIComponent(token.id)}`;
    case "transaction":
      return `/finance/transactions?tx=${encodeURIComponent(token.id)}`;
    case "invoice":
      return `/finance/invoices?invoice=${encodeURIComponent(token.id)}`;
    case "estimate":
      return `/finance/estimates/${encodeURIComponent(token.id)}`;
    case "contact":
      return undefined;
  }
}

function lookupLabel(kind: MentionKind, lookingUp: boolean): string {
  if (lookingUp) return "Looking up…";
  return kind === "task" ? "Task not found" : "Not found";
}

/** Build a typed card from the mention catalog when possible. */
export function cardPartFromCatalogToken(
  token: ParsedMentionToken,
  catalog: MentionCatalog,
): ChatUiCardPart | null {
  if (!isChatBelowCardMentionKind(token.kind)) return null;
  const href = resolveMentionHref(token, catalog) ?? undefined;

  switch (token.kind) {
    case "task": {
      const task = resolveMentionCatalogTask(token, catalog);
      if (!task) return null;
      return {
        type: "card",
        cardType: "task",
        id: `task-mention-${task.displayId}`,
        data: {
          taskId: task.id,
          displayId: task.displayId,
          title: task.title,
          href: href ?? hrefFromTaskDisplayId(task.displayId),
          status: task.status,
          description: task.description,
          priority: task.priority,
          dueDate: task.dueDate,
          projectName: task.projectName,
          projectIcon: task.projectIcon,
        },
      };
    }
    case "project": {
      const project = resolveMentionCatalogProject(token, catalog);
      if (!project) return null;
      return {
        type: "card",
        cardType: "project",
        id: `project-mention-${project.key}`,
        data: {
          projectId: project.id,
          href: href ?? `/projects/${encodeURIComponent(project.key)}`,
          key: project.key,
          name: project.name,
          summary: project.summary,
          status: project.status,
          area: project.area,
          icon: project.icon,
          type: project.type ?? null,
        },
      };
    }
    case "organization": {
      const organization = resolveMentionCatalogOrganization(token, catalog);
      if (!organization) return null;
      return {
        type: "card",
        cardType: "organization",
        id: `organization-mention-${organization.key}`,
        data: {
          organizationId: organization.id,
          href,
          key: organization.key,
          name: organization.name,
          email: organization.email,
          summary: organization.summary,
          avatarSrc: organization.avatarSrc ?? null,
          displayId: organization.displayId,
        },
      };
    }
    case "document": {
      const document = resolveMentionCatalogDocument(token, catalog);
      if (!document) return null;
      return {
        type: "card",
        cardType: "document",
        id: `document-mention-${document.id}`,
        data: {
          documentId: document.id,
          href,
          title: document.title,
          relativePath: document.relativePath,
          projectKey: document.projectKey,
          projectName: document.projectName,
          icon: document.icon,
          updatedAt: document.updatedAt,
        },
      };
    }
    case "letter": {
      const letter = resolveMentionCatalogLetter(token, catalog);
      if (!letter) return null;
      return {
        type: "card",
        cardType: "letter",
        id: `letter-mention-${letter.displayId}`,
        data: {
          letterId: letter.id,
          href,
          displayId: letter.displayId,
          title: letter.title,
          status: letter.status,
          dueDate: letter.dueDate,
          projectName: letter.projectName,
          description: null,
        },
      };
    }
    case "email": {
      const email = resolveMentionCatalogEmail(token, catalog);
      if (!email) return null;
      return {
        type: "card",
        cardType: "email",
        id: `email-mention-${email.displayId}`,
        data: {
          emailId: email.id,
          href,
          displayId: email.displayId,
          title: email.title,
          status: email.status,
          priority: email.priority,
          dueDate: email.dueDate,
          receivedAt: email.receivedAt,
          from: email.from,
          projectName: email.projectName,
          contactName: email.contactName,
          snippet: null,
        },
      };
    }
    case "meeting": {
      const meeting = resolveMentionCatalogMeeting(token, catalog);
      if (!meeting) return null;
      return {
        type: "card",
        cardType: "meeting",
        id: `meeting-mention-${meeting.displayId}`,
        data: {
          meetingId: meeting.id,
          href,
          displayId: meeting.displayId,
          title: meeting.title,
          startAt: meeting.startAt,
          endAt: meeting.endAt,
          status: meeting.status,
          summary: meeting.summary,
          location: meeting.location,
          projectName: meeting.projectName,
          projectIcon: meeting.projectIcon,
          organizationName: meeting.organizationName,
        },
      };
    }
    case "journal": {
      const journal = resolveMentionCatalogJournal(token, catalog);
      if (!journal) return null;
      return {
        type: "card",
        cardType: "journal",
        id: `journal-mention-${journal.date}`,
        data: {
          journalId: journal.id,
          href: href ?? `/journal/${encodeURIComponent(journal.date)}`,
          date: journal.date,
          title: journal.title,
          snippet: journal.snippet,
          updatedAt: journal.updatedAt,
        },
      };
    }
    case "habit": {
      const habit = resolveMentionCatalogHabit(token, catalog);
      if (!habit) return null;
      return {
        type: "card",
        cardType: "habit",
        id: `habit-mention-${habit.id}${token.date ? `-${token.date}` : ""}`,
        data: {
          habitId: habit.id,
          href,
          title: habit.title,
          icon: habit.icon,
          cadence: habit.cadence,
          date: token.date ?? habit.date,
          completed: habit.completed,
        },
      };
    }
    case "message": {
      const message = resolveMentionCatalogMessage(token, catalog);
      if (!message) return null;
      return {
        type: "card",
        cardType: "message",
        id: `message-mention-${message.id}`,
        data: {
          conversationId: message.id,
          href,
          channelType: message.channelType,
          title: message.title,
          contactName: message.contactName,
          preview: message.preview,
          status: message.status,
          lastActivityAt: message.lastActivityAt,
        },
      };
    }
    case "post": {
      const post = resolveMentionCatalogPost(token, catalog);
      if (!post) return null;
      return {
        type: "card",
        cardType: "post",
        id: `post-mention-${post.id}`,
        data: {
          postId: post.id,
          href,
          platform: post.platform,
          title: post.title,
          body: post.body,
          authorHandle: post.authorHandle,
          status: post.status,
          postedAt: post.postedAt,
          scheduledAt: post.scheduledAt,
        },
      };
    }
    case "transaction": {
      const transaction = resolveMentionCatalogTransaction(token, catalog);
      if (!transaction) return null;
      return {
        type: "card",
        cardType: "transaction",
        id: `transaction-mention-${transaction.id}`,
        data: {
          transactionId: transaction.id,
          href,
          title: transaction.title,
          amountCents: transaction.amountCents,
          currency: transaction.currency,
          bookedOn: transaction.bookedOn,
          accountName: transaction.accountName,
          categoryName: transaction.categoryName,
          counterparty: transaction.counterparty,
          notes: transaction.notes,
        },
      };
    }
    case "invoice": {
      const invoice = resolveMentionCatalogInvoice(token, catalog);
      if (!invoice) return null;
      return {
        type: "card",
        cardType: "invoice",
        id: `invoice-mention-${invoice.id}`,
        data: {
          invoiceId: invoice.id,
          href,
          title: invoice.title,
          invoiceNumber: invoice.invoiceNumber,
          state: invoice.state,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          amountLabel: invoice.amountLabel,
          contactName: invoice.contactName,
          currency: invoice.currency,
        },
      };
    }
    case "estimate": {
      const estimate = resolveMentionCatalogEstimate(token, catalog);
      if (!estimate) return null;
      return {
        type: "card",
        cardType: "estimate",
        id: `estimate-mention-${estimate.id}`,
        data: {
          estimateId: estimate.id,
          href,
          title: estimate.title,
          displayId: estimate.displayId,
          status: estimate.status,
          documentDate: estimate.documentDate,
          clientLabel: estimate.clientLabel,
          totalAmountCents: estimate.totalAmountCents,
          currency: estimate.currency,
        },
      };
    }
    default:
      return null;
  }
}

/**
 * Stub / loading card so the below-slot always renders for a mention.
 * Uses the typed cardType when known; otherwise a generic card.
 */
export function fallbackMentionCardPart(
  token: ParsedMentionToken,
  options?: { lookingUp?: boolean },
): ChatUiCardPart {
  const lookingUp = options?.lookingUp !== false;
  const statusText = lookupLabel(token.kind, lookingUp);
  const label = mentionTokenLabel(token);
  const href = hrefGuessFromToken(token);

  switch (token.kind) {
    case "task":
      return {
        type: "card",
        cardType: "task",
        id: `task-mention-${token.displayId}`,
        data: {
          taskId: token.displayId,
          displayId: token.displayId,
          title: token.displayId,
          href,
          description: statusText,
          status: "triage",
          priority: 0,
        },
      };
    case "project":
      return {
        type: "card",
        cardType: "project",
        id: `project-mention-${token.key}`,
        data: {
          projectId: token.key,
          key: token.key,
          name: token.key,
          href,
          summary: statusText,
          status: "backlog",
        },
      };
    case "organization":
      return {
        type: "card",
        cardType: "organization",
        id: `organization-mention-${token.key}`,
        data: {
          organizationId: token.key,
          key: token.key,
          name: token.key,
          href,
          summary: statusText,
        },
      };
    case "document":
      return {
        type: "card",
        cardType: "document",
        id: `document-mention-${token.projectKey}-${token.relativePath}`,
        data: {
          documentId: `${token.projectKey}/${token.relativePath}`,
          title: statusText,
          relativePath: token.relativePath,
          projectKey: token.projectKey,
          href,
        },
      };
    case "letter":
      return {
        type: "card",
        cardType: "letter",
        id: `letter-mention-${token.displayId}`,
        data: {
          letterId: token.displayId,
          displayId: token.displayId,
          title: token.displayId,
          href,
          description: statusText,
        },
      };
    case "email":
      return {
        type: "card",
        cardType: "email",
        id: `email-mention-${token.displayId}`,
        data: {
          emailId: token.displayId,
          displayId: token.displayId,
          title: token.displayId,
          href,
          snippet: statusText,
        },
      };
    case "meeting":
      return {
        type: "card",
        cardType: "meeting",
        id: `meeting-mention-${token.displayId}`,
        data: {
          meetingId: token.displayId,
          displayId: token.displayId,
          title: token.displayId,
          href,
          summary: statusText,
        },
      };
    case "journal":
      return {
        type: "card",
        cardType: "journal",
        id: `journal-mention-${token.date}`,
        data: {
          date: token.date,
          title: statusText,
          href,
          snippet: statusText,
        },
      };
    case "habit":
      return {
        type: "card",
        cardType: "habit",
        id: `habit-mention-${token.habitId}`,
        data: {
          habitId: token.habitId,
          title: statusText,
          href,
          date: token.date,
        },
      };
    case "message":
      return {
        type: "card",
        cardType: "message",
        id: `message-mention-${token.id}`,
        data: {
          conversationId: token.id,
          title: label,
          href,
          preview: statusText,
        },
      };
    case "post":
      return {
        type: "card",
        cardType: "post",
        id: `post-mention-${token.id}`,
        data: {
          postId: token.id,
          title: label,
          href,
          body: statusText,
        },
      };
    case "transaction":
      return {
        type: "card",
        cardType: "transaction",
        id: `transaction-mention-${token.id}`,
        data: {
          transactionId: token.id,
          title: label,
          href,
          notes: statusText,
        },
      };
    case "invoice":
      return {
        type: "card",
        cardType: "invoice",
        id: `invoice-mention-${token.id}`,
        data: {
          invoiceId: token.id,
          title: statusText,
          invoiceNumber: token.id,
          href,
          state: lookingUp ? "looking_up" : "not_found",
        },
      };
    case "estimate":
      return {
        type: "card",
        cardType: "estimate",
        id: `estimate-mention-${token.id}`,
        data: {
          estimateId: token.id,
          title: statusText,
          displayId: token.id,
          href,
          status: lookingUp ? "looking_up" : "not_found",
        },
      };
    case "contact":
      // Should never be called for contacts; generic guard.
      return {
        type: "card",
        cardType: "generic",
        id: `generic-mention-contact-${token.key}`,
        data: {
          kind: "contact",
          ref: token.key,
          title: token.key,
          status: statusText,
          href,
        },
      };
  }
}

/** @deprecated Use {@link fallbackMentionCardPart}. */
export function fallbackTaskCardPart(
  token: Extract<ParsedMentionToken, { kind: "task" }>,
  options?: { lookingUp?: boolean },
): ChatUiCardPart {
  return fallbackMentionCardPart(token, options);
}

/** Below-card mention tokens in a markdown/plain body, left-to-right. */
export function belowCardMentionTokensInText(
  text: string,
): ParsedMentionToken[] {
  const out: ParsedMentionToken[] = [];
  for (const segment of segmentMarkdownWithMentions(text)) {
    if (segment.type !== "mention") continue;
    if (!isChatBelowCardMentionKind(segment.token.kind)) continue;
    out.push(segment.token);
  }
  return out;
}

/** @deprecated Use {@link belowCardMentionTokensInText} (tasks only). */
export function taskMentionTokensInText(
  text: string,
): Array<Extract<ParsedMentionToken, { kind: "task" }>> {
  return belowCardMentionTokensInText(text).filter(
    (token): token is Extract<ParsedMentionToken, { kind: "task" }> =>
      token.kind === "task",
  );
}

/** Unique below-card mention tokens on a message, in first-seen order. */
export function belowCardMentionTokensInMessage(
  message: ChatUiMessage,
): ParsedMentionToken[] {
  const seen = new Set<string>();
  const out: ParsedMentionToken[] = [];
  for (const part of message.parts) {
    if (part.type !== "text") continue;
    for (const token of belowCardMentionTokensInText(part.text)) {
      const key = mentionDedupeKey(token);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
  }
  return out;
}

/** @deprecated Use {@link belowCardMentionTokensInMessage} (tasks only). */
export function taskMentionTokensInMessage(
  message: ChatUiMessage,
): Array<Extract<ParsedMentionToken, { kind: "task" }>> {
  return belowCardMentionTokensInMessage(message).filter(
    (token): token is Extract<ParsedMentionToken, { kind: "task" }> =>
      token.kind === "task",
  );
}

/**
 * Remove below-card mention tokens whose dedupe keys are in `keys`, then tidy
 * leftover whitespace / a dangling trailing colon / empty paragraphs.
 * Contact and organization tokens are never stripped.
 */
export function stripBelowCardMentionsFromText(
  text: string,
  keys: ReadonlySet<string>,
): string {
  if (!text || keys.size === 0) return text;

  const pieces: string[] = [];
  for (const segment of segmentMarkdownWithMentions(text)) {
    if (segment.type === "mention") {
      const key = mentionDedupeKey(segment.token);
      if (key && keys.has(key)) continue;
    }
    if (segment.type === "markdown") {
      pieces.push(segment.content);
      continue;
    }
    pieces.push(segment.raw);
  }

  let out = pieces.join("");
  out = out.replace(/[^\S\n]+/g, " ");
  out = out.replace(/ +([.,;:!?])/g, "$1");
  out = out.replace(/ *\n */g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.trim();
  out = out.replace(/:\s*$/u, "").trim();
  return out;
}

/**
 * @deprecated Prefer {@link stripBelowCardMentionsFromText} with `task:…` keys.
 * Accepts lowercased task display ids for backward-compatible tests.
 */
export function stripTaskMentionsFromText(
  text: string,
  displayIds: ReadonlySet<string>,
): string {
  const keys = new Set<string>();
  for (const id of displayIds) {
    const trimmed = id.trim().toLowerCase();
    if (!trimmed) continue;
    keys.add(trimmed.startsWith("task:") ? trimmed : `task:${trimmed}`);
  }
  return stripBelowCardMentionsFromText(text, keys);
}

export type ChatMessageBubblePartsOptions = {
  /**
   * Dedupe keys (`kind:id`) for mentions that already have a card below —
   * strip matching tokens from bubble text. Also accepts legacy bare task
   * display ids (mapped to `task:…`).
   */
  stripMentionKeys?: ReadonlySet<string> | null;
  /** @deprecated Use {@link stripMentionKeys}. */
  stripTaskDisplayIds?: ReadonlySet<string> | null;
};

function normalizeStripKeys(
  options?: ChatMessageBubblePartsOptions | null,
): Set<string> | null {
  const raw = options?.stripMentionKeys ?? options?.stripTaskDisplayIds ?? null;
  if (!raw || raw.size === 0) return null;
  const keys = new Set<string>();
  for (const entry of raw) {
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) continue;
    if (trimmed.includes(":")) {
      keys.add(trimmed);
    } else {
      // Legacy bare task display id.
      keys.add(`task:${trimmed}`);
    }
  }
  return keys.size > 0 ? keys : null;
}

/**
 * Parts that stay inside the message bubble — below-card types are lifted out
 * (contact / organization stay), and text mentions for below-cards are stripped.
 */
export function chatMessageBubbleParts(
  parts: readonly ChatUiMessagePart[],
  options?: ChatMessageBubblePartsOptions | null,
): ChatUiMessagePart[] {
  const stripKeys = normalizeStripKeys(options);
  const out: ChatUiMessagePart[] = [];
  for (const part of parts) {
    const card = asCardPart(part);
    if (card && !isInlineChatCardType(card.cardType)) {
      // Lift every non-inline entity card below the bubble.
      continue;
    }
    if (part.type === "text" && stripKeys) {
      const text = stripBelowCardMentionsFromText(part.text, stripKeys);
      if (!text.trim()) continue;
      out.push(text === part.text ? part : { ...part, text });
      continue;
    }
    out.push(part);
  }
  return out;
}

export type CollectChatMentionCardsBelowOptions = {
  catalog?: MentionCatalog | null;
  /**
   * Extra resolutions keyed by dedupe key `kind:id` (lowercased). Also accepts
   * legacy bare task display ids (mapped to `task:…`).
   */
  resolvedByKey?: ReadonlyMap<string, ChatUiCardPart> | null;
  /**
   * @deprecated Prefer {@link resolvedByKey}. Bare task display ids only.
   */
  resolvedByDisplayId?: ReadonlyMap<string, ChatUiCardPart> | null;
  /**
   * When true, unresolved stubs say "Looking up…"; when false, "Not found".
   * Default true.
   */
  lookingUp?: boolean;
};

/** @deprecated Use {@link CollectChatMentionCardsBelowOptions}. */
export type CollectChatTaskCardsBelowOptions = CollectChatMentionCardsBelowOptions;

function resolveFromMaps(
  key: string,
  resolvedByKey: ReadonlyMap<string, ChatUiCardPart> | null,
  resolvedByDisplayId: ReadonlyMap<string, ChatUiCardPart> | null,
): ChatUiCardPart | null {
  const fromKey = resolvedByKey?.get(key) ?? null;
  if (fromKey) return fromKey;
  if (key.startsWith("task:") && resolvedByDisplayId) {
    return resolvedByDisplayId.get(key.slice("task:".length)) ?? null;
  }
  // Legacy map may use bare display ids as keys when callers still pass
  // resolvedByDisplayId alone under the old collectChatTaskCardsBelow API.
  if (resolvedByDisplayId && !key.includes(":")) {
    return resolvedByDisplayId.get(key) ?? null;
  }
  return null;
}

function isCollectOptions(
  value: unknown,
): value is CollectChatMentionCardsBelowOptions {
  return (
    value != null &&
    typeof value === "object" &&
    ("catalog" in value ||
      "resolvedByKey" in value ||
      "resolvedByDisplayId" in value ||
      "lookingUp" in value)
  );
}

/**
 * Unique mention cards below the bubble, first-seen order, deduped by kind+id.
 * Prefers an explicit `card` part, then workspace resolution, then catalog,
 * then a stub. Contact and organization mentions are never included.
 */
export function collectChatMentionCardsBelow(
  message: ChatUiMessage,
  catalogOrOptions:
    | MentionCatalog
    | null
    | CollectChatMentionCardsBelowOptions = null,
): ChatMentionBelowCard[] {
  const options: CollectChatMentionCardsBelowOptions = isCollectOptions(
    catalogOrOptions,
  )
    ? catalogOrOptions
    : { catalog: catalogOrOptions as MentionCatalog | null };

  const catalog = options.catalog ?? null;
  const resolvedByKey = options.resolvedByKey ?? null;
  const resolvedByDisplayId = options.resolvedByDisplayId ?? null;
  const lookingUp = options.lookingUp !== false;

  const slots: MentionSlot[] = [];
  const indexByKey = new Map<string, number>();

  const ensureSlot = (key: string): MentionSlot => {
    const existing = indexByKey.get(key);
    if (existing != null) return slots[existing]!;
    const slot: MentionSlot = { key, token: null, cardPart: null };
    indexByKey.set(key, slots.length);
    slots.push(slot);
    return slot;
  };

  for (const part of message.parts) {
    if (part.type === "text") {
      for (const token of belowCardMentionTokensInText(part.text)) {
        const key = mentionDedupeKey(token);
        if (!key) continue;
        const slot = ensureSlot(key);
        if (!slot.token) slot.token = token;
      }
      continue;
    }

    const card = asCardPart(part);
    if (!card || isInlineChatCardType(card.cardType)) continue;
    const key = cardPartDedupeKey(card);
    if (!key) continue;
    const slot = ensureSlot(key);
    if (!slot.cardPart) slot.cardPart = card;
  }

  const out: ChatMentionBelowCard[] = [];
  for (const slot of slots) {
    if (slot.cardPart) {
      out.push({ key: slot.key, part: slot.cardPart, unresolved: false });
      continue;
    }
    const fromResolved = resolveFromMaps(
      slot.key,
      resolvedByKey,
      resolvedByDisplayId,
    );
    if (fromResolved) {
      out.push({ key: slot.key, part: fromResolved, unresolved: false });
      continue;
    }
    if (slot.token && catalog) {
      const fromCatalog = cardPartFromCatalogToken(slot.token, catalog);
      if (fromCatalog) {
        out.push({ key: slot.key, part: fromCatalog, unresolved: false });
        continue;
      }
    }
    if (slot.token) {
      out.push({
        key: slot.key,
        part: fallbackMentionCardPart(slot.token, { lookingUp }),
        unresolved: true,
      });
    }
  }
  return out;
}

/**
 * @deprecated Use {@link collectChatMentionCardsBelow}. Kept for task-focused
 * call sites; returns all below-card kinds (not only tasks).
 */
export function collectChatTaskCardsBelow(
  message: ChatUiMessage,
  catalogOrOptions:
    | MentionCatalog
    | null
    | CollectChatTaskCardsBelowOptions = null,
): ChatMentionBelowCard[] {
  return collectChatMentionCardsBelow(message, catalogOrOptions);
}

/** Clipboard text for a task card part — raw mention token when possible. */
export function taskCardPlainText(part: ChatUiCardPart): string {
  if (part.cardType !== "task") return part.cardType;
  const data = taskDataFromCardPart(part);
  const displayId = data?.displayId?.trim() || data?.taskId?.trim();
  return displayId ? `[@task:${displayId}]` : "";
}

/** Parse a raw `[@task:…]` string; null if not a task mention. */
export function parseTaskMentionToken(
  raw: string,
): Extract<ParsedMentionToken, { kind: "task" }> | null {
  const parsed = parseMentionToken(raw);
  return parsed?.kind === "task" ? parsed : null;
}
