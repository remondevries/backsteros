/**
 * Source-agnostic chat message format for the unified ChatThread UI.
 *
 * One shape for Messages channels (Telegram/WhatsApp/X/support), Grok Bot
 * agents (webhooks), and Cursor coding agents (T3 Code). Adapters map each
 * source into this format; `@backsteros/ui` ChatThread renders it.
 *
 * Keep this small — add parts only when a real source needs them.
 */
import { z } from "zod";

/** Lifecycle of a single message in the thread. */
export const chatUiMessageStatusSchema = z.enum([
  "pending",
  "streaming",
  "done",
  "error",
]);
export type ChatUiMessageStatus = z.infer<typeof chatUiMessageStatusSchema>;

/** Who produced the message (UI alignment / avatar). */
export const chatUiMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);
export type ChatUiMessageRole = z.infer<typeof chatUiMessageRoleSchema>;

export const chatUiAuthorSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
});
export type ChatUiAuthor = z.infer<typeof chatUiAuthorSchema>;

export const chatUiToolCallStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "error",
]);
export type ChatUiToolCallStatus = z.infer<typeof chatUiToolCallStatusSchema>;

/** Plain / markdown text body. */
export const chatUiTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  /** When true, render as markdown (GFM). Default false = plain. */
  markdown: z.boolean().optional(),
});
export type ChatUiTextPart = z.infer<typeof chatUiTextPartSchema>;

/** Image or generic file attachment. */
export const chatUiFilePartSchema = z.object({
  type: z.literal("file"),
  url: z.string(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
  /** Prefer image rendering when mime starts with image/ or this is set. */
  kind: z.enum(["image", "file"]).optional(),
});
export type ChatUiFilePart = z.infer<typeof chatUiFilePartSchema>;

/** Expandable tool invocation (agent tools, MCP, etc.). */
export const chatUiToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  id: z.string().optional(),
  name: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  status: chatUiToolCallStatusSchema.optional(),
});
export type ChatUiToolCallPart = z.infer<typeof chatUiToolCallPartSchema>;

/** Code / patch diff block. */
export const chatUiDiffPartSchema = z.object({
  type: z.literal("diff"),
  language: z.string().optional(),
  /** Unified diff or before/after text. */
  content: z.string(),
  filename: z.string().optional(),
});
export type ChatUiDiffPart = z.infer<typeof chatUiDiffPartSchema>;

/** Centered system status line (activity, typing notice, etc.). */
export const chatUiStatusLinePartSchema = z.object({
  type: z.literal("status-line"),
  text: z.string(),
});
export type ChatUiStatusLinePart = z.infer<typeof chatUiStatusLinePartSchema>;

/** Inline error callout. */
export const chatUiErrorPartSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  code: z.string().optional(),
});
export type ChatUiErrorPart = z.infer<typeof chatUiErrorPartSchema>;

/** Human-in-the-loop approval gate. */
export const chatUiApprovalRequestPartSchema = z.object({
  type: z.literal("approval-request"),
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  /** Opaque payload for the approver UI / backend. */
  data: z.record(z.unknown()).optional(),
});
export type ChatUiApprovalRequestPart = z.infer<
  typeof chatUiApprovalRequestPartSchema
>;

/**
 * Pluggable card — `cardType` selects a renderer from the ChatThread card
 * registry (`task`, `contact`, `document`, `project`, `email`, …).
 */
export const chatUiCardPartSchema = z.object({
  type: z.literal("card"),
  cardType: z.string(),
  id: z.string(),
  data: z.record(z.unknown()).optional(),
});
export type ChatUiCardPart = z.infer<typeof chatUiCardPartSchema>;

export const chatUiMessagePartSchema = z.discriminatedUnion("type", [
  chatUiTextPartSchema,
  chatUiFilePartSchema,
  chatUiToolCallPartSchema,
  chatUiDiffPartSchema,
  chatUiStatusLinePartSchema,
  chatUiErrorPartSchema,
  chatUiApprovalRequestPartSchema,
  chatUiCardPartSchema,
]);
export type ChatUiMessagePart = z.infer<typeof chatUiMessagePartSchema>;

export const chatUiMessageSchema = z.object({
  id: z.string(),
  role: chatUiMessageRoleSchema,
  author: chatUiAuthorSchema.optional(),
  parts: z.array(chatUiMessagePartSchema),
  status: chatUiMessageStatusSchema.default("done"),
  createdAt: z.string().datetime().optional(),
});
export type ChatUiMessage = z.infer<typeof chatUiMessageSchema>;

export const chatUiThreadSchema = z.object({
  id: z.string(),
  messages: z.array(chatUiMessageSchema),
});
export type ChatUiThread = z.infer<typeof chatUiThreadSchema>;

/** Card payload for `cardType: "task"` — matches document mention block chips. */
export const chatUiTaskCardDataSchema = z.object({
  taskId: z.string(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  href: z.string().optional(),
  status: z.string().optional(),
  /** Short body preview shown when the chat task card expands. */
  description: z.string().nullable().optional(),
  /** 0 = none … 4 = low (Task.priority scale). */
  priority: z.number().int().min(0).max(4).optional(),
  /** Epoch ms or ISO datetime. */
  dueDate: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectIcon: z.string().nullable().optional(),
  /** Assignee display name (expand row — not on the collapsed chip). */
  assigneeName: z.string().nullable().optional(),
  /** Related contact / org / email display labels. */
  related: z.array(z.string()).optional(),
  /** Workspace label display names. */
  labels: z.array(z.string()).optional(),
});
export type ChatUiTaskCardData = z.infer<typeof chatUiTaskCardDataSchema>;

/** Card payload for `cardType: "contact"`. */
export const chatUiContactCardDataSchema = z.object({
  contactId: z.string(),
  href: z.string().optional(),
  name: z.string().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  organizationAvatarSrc: z.string().nullable().optional(),
  avatarSrc: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  displayId: z.string().nullable().optional(),
});
export type ChatUiContactCardData = z.infer<typeof chatUiContactCardDataSchema>;

/** Card payload for `cardType: "document"`. */
export const chatUiDocumentCardDataSchema = z.object({
  documentId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  relativePath: z.string().optional(),
  projectKey: z.string().optional(),
  projectName: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  /** Epoch ms or ISO datetime. */
  updatedAt: z.union([z.number(), z.string().datetime()]).optional(),
});
export type ChatUiDocumentCardData = z.infer<
  typeof chatUiDocumentCardDataSchema
>;

/** Card payload for `cardType: "project"`. */
export const chatUiProjectCardDataSchema = z.object({
  projectId: z.string(),
  href: z.string().optional(),
  key: z.string().optional(),
  name: z.string().optional(),
  summary: z.string().nullable().optional(),
  status: z.string().optional(),
  area: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
});
export type ChatUiProjectCardData = z.infer<typeof chatUiProjectCardDataSchema>;

/** Card payload for `cardType: "organization"`. */
export const chatUiOrganizationCardDataSchema = z.object({
  organizationId: z.string(),
  href: z.string().optional(),
  key: z.string().optional(),
  name: z.string().optional(),
  email: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  avatarSrc: z.string().nullable().optional(),
  displayId: z.string().nullable().optional(),
});
export type ChatUiOrganizationCardData = z.infer<
  typeof chatUiOrganizationCardDataSchema
>;

/** Card payload for `cardType: "email"`. */
export const chatUiEmailCardDataSchema = z.object({
  emailId: z.string(),
  href: z.string().optional(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  dueDate: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  /** Receive / latest activity timestamp (epoch ms or ISO). */
  receivedAt: z
    .union([z.number(), z.string().datetime()])
    .nullable()
    .optional(),
  /** Raw From header when no linked contact. */
  from: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
});
export type ChatUiEmailCardData = z.infer<typeof chatUiEmailCardDataSchema>;

/** Card payload for `cardType: "letter"`. */
export const chatUiLetterCardDataSchema = z.object({
  letterId: z.string(),
  href: z.string().optional(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  projectName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type ChatUiLetterCardData = z.infer<typeof chatUiLetterCardDataSchema>;

/** Card payload for `cardType: "meeting"`. */
export const chatUiMeetingCardDataSchema = z.object({
  meetingId: z.string(),
  href: z.string().optional(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  startAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  endAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  status: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectIcon: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
});
export type ChatUiMeetingCardData = z.infer<typeof chatUiMeetingCardDataSchema>;

/** Card payload for `cardType: "journal"`. */
export const chatUiJournalCardDataSchema = z.object({
  journalId: z.string().optional(),
  href: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().optional(),
  snippet: z.string().nullable().optional(),
  updatedAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
});
export type ChatUiJournalCardData = z.infer<typeof chatUiJournalCardDataSchema>;

/** Card payload for `cardType: "habit"`. */
export const chatUiHabitCardDataSchema = z.object({
  habitId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  icon: z.string().nullable().optional(),
  cadence: z.string().nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  completed: z.boolean().nullable().optional(),
});
export type ChatUiHabitCardData = z.infer<typeof chatUiHabitCardDataSchema>;

/** Card payload for `cardType: "message"` (chat conversation). */
export const chatUiMessageCardDataSchema = z.object({
  conversationId: z.string(),
  href: z.string().optional(),
  channelType: z.string().optional(),
  title: z.string().optional(),
  contactName: z.string().nullable().optional(),
  preview: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  lastActivityAt: z
    .union([z.number(), z.string().datetime()])
    .nullable()
    .optional(),
});
export type ChatUiMessageCardData = z.infer<typeof chatUiMessageCardDataSchema>;

/** Card payload for `cardType: "post"` (social network). */
export const chatUiPostCardDataSchema = z.object({
  postId: z.string(),
  href: z.string().optional(),
  platform: z.string().nullable().optional(),
  title: z.string().optional(),
  body: z.string().nullable().optional(),
  authorHandle: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  postedAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  scheduledAt: z
    .union([z.number(), z.string().datetime()])
    .nullable()
    .optional(),
});
export type ChatUiPostCardData = z.infer<typeof chatUiPostCardDataSchema>;

/** Card payload for `cardType: "transaction"`. */
export const chatUiTransactionCardDataSchema = z.object({
  transactionId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  amountCents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  bookedOn: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type ChatUiTransactionCardData = z.infer<
  typeof chatUiTransactionCardDataSchema
>;

/** Card payload for `cardType: "invoice"` (Moneybird sales invoice). */
export const chatUiInvoiceCardDataSchema = z.object({
  invoiceId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  invoiceNumber: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  amountLabel: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});
export type ChatUiInvoiceCardData = z.infer<typeof chatUiInvoiceCardDataSchema>;

/** Card payload for `cardType: "estimate"` (Lemo-Design proposal). */
export const chatUiEstimateCardDataSchema = z.object({
  estimateId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  displayId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  clientLabel: z.string().nullable().optional(),
  totalAmountCents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
});
export type ChatUiEstimateCardData = z.infer<typeof chatUiEstimateCardDataSchema>;
