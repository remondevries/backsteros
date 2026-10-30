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
 * Pluggable card — `type` selects a renderer from the ChatThread card registry.
 * Start with `task` (links to a BacksterOS task).
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

/** Card payload for `cardType: "task"`. */
export const chatUiTaskCardDataSchema = z.object({
  taskId: z.string(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  href: z.string().optional(),
  status: z.string().optional(),
});
export type ChatUiTaskCardData = z.infer<typeof chatUiTaskCardDataSchema>;
