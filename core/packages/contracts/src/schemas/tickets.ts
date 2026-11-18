import { z } from "zod";

import { taskStatusSchema } from "./common.js";
import {
  createTaskCommentSchema,
  listTasksQuerySchema,
  taskApiSchema,
  taskCommentSchema,
  taskInlineCommentSchema,
  taskSchema,
  updateTaskCommentSchema,
  linkedCommitShaSchema,
  taskLinkSchema,
  taskImagesUploadFieldSchema,
  executionLocationSchema,
} from "./projects-tasks.js";

/**
 * Support tickets (OS-187) are tasks with `support: true`.
 * Status `waiting` means waiting on the client; `waiting_on_client` is accepted
 * on write as an alias for `waiting`.
 */
export const ticketStatusWriteSchema = z.union([
  taskStatusSchema,
  z.literal("waiting_on_client"),
]);

export function normalizeTicketStatus(
  status: z.infer<typeof ticketStatusWriteSchema> | string,
): z.infer<typeof taskStatusSchema> {
  if (status === "waiting_on_client") return "waiting";
  return status as z.infer<typeof taskStatusSchema>;
}

/** Ticket = full task row; `support` is always true. */
export const ticketSchema = taskSchema;
export const ticketApiSchema = taskApiSchema;

/** Same list filters as tasks; handlers force `support=true`. */
export const listTicketsQuerySchema = listTasksQuerySchema;

const ticketCreateFieldsSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  projectId: z.string().nullable().optional(),
  projectKey: z.string().min(1).max(64).optional(),
  contactId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  relatedContactIds: z.array(z.string()).optional(),
  relatedOrganizationIds: z.array(z.string()).optional(),
  linkedEmailIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string().min(1).max(64)).max(32).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  status: ticketStatusWriteSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  dueEndDate: z.string().datetime().nullable().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
  triagedAt: z.string().datetime().nullable().optional(),
  inbox: z.boolean().optional(),
  /** Always true for tickets; accepted for symmetry. */
  support: z.boolean().optional(),
  notification: z.boolean().optional(),
  links: z.array(taskLinkSchema).max(20).optional(),
  penpotFileId: z.string().uuid().nullable().optional(),
  penpotPageId: z.string().uuid().nullable().optional(),
  penpotObjectId: z.string().uuid().nullable().optional(),
  agentChatId: z.string().max(128).nullable().optional(),
  executionLocation: executionLocationSchema.nullable().optional(),
  lockExecutionLocation: z.boolean().optional(),
  agentWorkingContactId: z.string().min(1).max(64).nullable().optional(),
  agentWorkingLabel: z.string().max(256).nullable().optional(),
  agentWorkingKind: z.enum(["working", "reviewing"]).nullable().optional(),
  linkedCommitShas: z.array(linkedCommitShaSchema).max(20).optional(),
  automateCompletion: z.boolean().optional(),
  habitId: z.string().nullable().optional(),
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  agentCreatedAt: z.string().datetime().nullable().optional(),
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
  activityActor: z.enum(["user", "agent"]).optional(),
  comment: taskInlineCommentSchema.optional(),
  images: taskImagesUploadFieldSchema.optional(),
});

function ticketWaitingFollowUpOk(value: {
  status?: string;
  followUpDate?: string | null;
}): boolean {
  const status =
    value.status == null ? undefined : normalizeTicketStatus(value.status);
  return (
    status !== "waiting" ||
    (typeof value.followUpDate === "string" && value.followUpDate.length > 0)
  );
}

export const createTicketSchema = ticketCreateFieldsSchema.refine(
  ticketWaitingFollowUpOk,
  {
    message: "followUpDate is required when status is waiting / waiting_on_client",
    path: ["followUpDate"],
  },
);

export const updateTicketSchema = ticketCreateFieldsSchema
  .partial()
  .extend({
    agentInboxApproved: z.boolean().optional(),
    agentInboxApprovedAt: z.string().datetime().nullable().optional(),
    acknowledgeInboxUpdate: z.boolean().optional(),
    inboxUpdatedAt: z.string().datetime().nullable().optional(),
    addLinkedCommitShas: z.array(linkedCommitShaSchema).max(20).optional(),
    removeLinkedCommitShas: z.array(linkedCommitShaSchema).max(20).optional(),
    autoReviewDeliveryStatus: z
      .enum(["pending", "delivered", "failed"])
      .nullable()
      .optional(),
    executionLocationLockedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).filter(
        (key) =>
          key !== "activityActor" &&
          key !== "agentInboxApproved" &&
          key !== "acknowledgeInboxUpdate",
      ).length > 0 ||
      value.agentInboxApproved === true ||
      value.acknowledgeInboxUpdate === true,
    { message: "At least one field is required" },
  );
  // Waiting follow-up for updates is enforced in the task write path against
  // the existing row (same as PATCH /tasks).

/**
 * Create a support ticket from an existing AgentMail thread and link it.
 * Does not send mail. Optional `backfill` imports historical messages as
 * timeline entries (idempotent on message id).
 */
export const createTicketFromEmailSchema = z.object({
  inboxId: z.string().min(1),
  /** AgentMail thread id (or message id fallback used as thread key). */
  threadId: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10_000).nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectKey: z.string().optional(),
  contactId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  relatedContactIds: z.array(z.string()).optional(),
  relatedOrganizationIds: z.array(z.string()).optional(),
  status: ticketStatusWriteSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeId: z.string().nullable().optional(),
  activityActor: z.enum(["user", "agent"]).optional(),
  /** Import historical thread messages into the ticket timeline. Default true. */
  backfill: z.boolean().optional().default(true),
});

export const syncTicketEmailsSchema = z.object({
  /**
   * When true, treat newly created entries as imports (sets importedAt / audit).
   * Live auto-sync uses false (default).
   */
  backfill: z.boolean().optional().default(false),
  activityActor: z.enum(["user", "agent"]).optional(),
  authorContactId: z.string().nullable().optional(),
});

export const ticketEmailSyncResultSchema = z.object({
  ticketId: z.string(),
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  status: taskStatusSchema.optional(),
  /** Always false — ticket sync/backfill/comment paths never send mail. */
  sentMail: z.literal(false),
  entries: z.array(taskCommentSchema).optional(),
});

export const createTicketCommentSchema = createTaskCommentSchema;
export const updateTicketCommentSchema = updateTaskCommentSchema;
export const ticketCommentSchema = taskCommentSchema;

export const listTicketCommentsQuerySchema = z.object({
  /**
   * Filter by visibility. Default `all` for staff/agents.
   * Portal should request `client_visible`.
   */
  visibility: z
    .enum(["client_visible", "internal", "all"])
    .optional()
    .default("all"),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export type Ticket = z.infer<typeof ticketSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type CreateTicketFromEmailInput = z.infer<
  typeof createTicketFromEmailSchema
>;
export type SyncTicketEmailsInput = z.infer<typeof syncTicketEmailsSchema>;
export type TicketEmailSyncResult = z.infer<typeof ticketEmailSyncResultSchema>;
