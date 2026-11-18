import { initContract, type AppRouter } from "@ts-rest/core";
import { z } from "zod";

import {
  badRequestSchema,
  errorSchema,
  listPaginatedResponseSchema,
  listTasksLegacyResponseSchema,
} from "../schemas.js";
import {
  createTicketFromEmailSchema,
  createTicketSchema,
  listTicketCommentsQuerySchema,
  listTicketsQuerySchema,
  syncTicketEmailsSchema,
  ticketApiSchema,
  ticketCommentSchema,
  ticketEmailSyncResultSchema,
  ticketSchema,
  updateTicketSchema,
  createTicketCommentSchema,
  updateTicketCommentSchema,
} from "../schemas/tickets.js";

const c = initContract();

/**
 * Support tickets (OS-187) — agents API resource over tasks with `support: true`.
 * Comment/timeline writes never send mail or notify the client.
 */
export const ticketsRoutes: AppRouter = c.router({
  listTickets: {
    method: "GET",
    path: "/api/v1/tickets",
    query: listTicketsQuerySchema,
    responses: {
      200: z.union([
        listTasksLegacyResponseSchema,
        listPaginatedResponseSchema(ticketSchema),
        z.object({ tickets: z.array(ticketSchema) }),
      ]),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List support tickets (tasks with support:true). Waiting = waiting on client.",
  },
  getTicket: {
    method: "GET",
    path: "/api/v1/tickets/:id",
    pathParams: z.object({
      id: z.string(),
    }),
    query: z
      .object({
        include: z.string().optional(),
      })
      .optional(),
    responses: {
      200: ticketApiSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get support ticket by id or KEY-number",
  },
  createTicket: {
    method: "POST",
    path: "/api/v1/tickets",
    body: createTicketSchema,
    responses: {
      201: ticketApiSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "Create a support ticket (forces support:true). Never sends mail.",
  },
  updateTicket: {
    method: "PATCH",
    path: "/api/v1/tickets/:id",
    pathParams: z.object({
      id: z.string(),
    }),
    body: updateTicketSchema,
    responses: {
      200: ticketApiSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Update a support ticket (status waiting / waiting_on_client = waiting on client). Never sends mail.",
  },
  createTicketFromEmail: {
    method: "POST",
    path: "/api/v1/tickets/from-email",
    body: createTicketFromEmailSchema,
    responses: {
      201: z.object({
        ticket: ticketApiSchema,
        sync: ticketEmailSyncResultSchema.optional(),
        sentMail: z.literal(false),
      }),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Create a support ticket from an AgentMail thread (inboxId + threadId), link it, optionally backfill timeline. Never sends mail.",
  },
  syncTicketEmails: {
    method: "POST",
    path: "/api/v1/tickets/:id/sync-emails",
    pathParams: z.object({
      id: z.string(),
    }),
    body: syncTicketEmailsSchema,
    responses: {
      200: ticketEmailSyncResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Sync / backfill linked email messages into the ticket timeline (idempotent on message id). Never sends mail.",
  },
  listTicketComments: {
    method: "GET",
    path: "/api/v1/tickets/:id/comments",
    pathParams: z.object({
      id: z.string(),
    }),
    query: listTicketCommentsQuerySchema,
    responses: {
      200: z.object({ comments: z.array(ticketCommentSchema) }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List ticket timeline comments. Use visibility=client_visible for portal-safe rows.",
  },
  createTicketComment: {
    method: "POST",
    path: "/api/v1/tickets/:id/comments",
    pathParams: z.object({
      id: z.string(),
    }),
    body: createTicketCommentSchema,
    responses: {
      201: ticketCommentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Add a ticket comment/note (visibility internal|client_visible). Never sends mail or notifies the client.",
  },
  updateTicketComment: {
    method: "PATCH",
    path: "/api/v1/tickets/:id/comments/:commentId",
    pathParams: z.object({
      id: z.string(),
      commentId: z.string(),
    }),
    body: updateTicketCommentSchema,
    responses: {
      200: ticketCommentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update a ticket comment (visibility / body). Never sends mail.",
  },
});
