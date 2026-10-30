import { initContract, type AppRouter } from "@ts-rest/core";
import { z } from "zod";

import {
  agentSchema,
  agentWebhookTestResultSchema,
  agentsListSchema,
  badRequestSchema,
  createAgentInputSchema,
  createChatThreadMessageInputSchema,
  createChatThreadMessageResultSchema,
  chatThreadMessagesListSchema,
  chatThreadSchema,
  chatThreadWithMessagesSchema,
  chatThreadsListSchema,
  deleteChatThreadMessagesInputSchema,
  deleteChatThreadMessagesResultSchema,
  errorSchema,
  getOrCreateChatThreadInputSchema,
  reorderAgentsInputSchema,
  updateAgentInputSchema,
} from "../schemas.js";

const c = initContract();

/** Agents (OS-151) + shell chat threads (OS-150). */
export const agentsChatRoutes: AppRouter = c.router({
  listAgents: {
    method: "GET",
    path: "/api/v1/agents",
    responses: {
      200: agentsListSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List chat agents (webhook secret never included)",
  },
  getAgent: {
    method: "GET",
    path: "/api/v1/agents/:agentId",
    pathParams: z.object({ agentId: z.string() }),
    responses: {
      200: agentSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get one chat agent",
  },
  createAgent: {
    method: "POST",
    path: "/api/v1/agents",
    body: createAgentInputSchema,
    responses: {
      201: agentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Create a chat agent (webhook secret write-only)",
  },
  updateAgent: {
    method: "PATCH",
    path: "/api/v1/agents/:agentId",
    pathParams: z.object({ agentId: z.string() }),
    body: updateAgentInputSchema,
    responses: {
      200: agentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update a chat agent (set/replace webhook secret; never returned)",
  },
  deleteAgent: {
    method: "DELETE",
    path: "/api/v1/agents/:agentId",
    pathParams: z.object({ agentId: z.string() }),
    responses: {
      204: z.void(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Delete a chat agent",
  },
  testAgentWebhook: {
    method: "POST",
    path: "/api/v1/agents/:agentId/webhook/test",
    pathParams: z.object({ agentId: z.string() }),
    body: z.object({}).default({}),
    responses: {
      200: agentWebhookTestResultSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Send a one-shot test POST to the agent chat webhook",
  },
  reorderAgents: {
    method: "PUT",
    path: "/api/v1/agents/reorder",
    body: reorderAgentsInputSchema,
    responses: {
      200: agentsListSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Set chat/settings display order for agents (low → high)",
  },
  listChatThreads: {
    method: "GET",
    path: "/api/v1/chat/threads",
    query: z.object({
      agentId: z.string().optional(),
    }),
    responses: {
      200: chatThreadsListSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List shell chat threads",
  },
  getOrCreateChatThread: {
    method: "POST",
    path: "/api/v1/chat/threads",
    body: getOrCreateChatThreadInputSchema,
    responses: {
      200: chatThreadWithMessagesSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get or create the thread for an agent (includes messages)",
  },
  getChatThread: {
    method: "GET",
    path: "/api/v1/chat/threads/:threadId",
    pathParams: z.object({ threadId: z.string() }),
    responses: {
      200: chatThreadWithMessagesSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get a chat thread with messages",
  },
  listChatThreadMessages: {
    method: "GET",
    path: "/api/v1/chat/threads/:threadId/messages",
    pathParams: z.object({ threadId: z.string() }),
    responses: {
      200: chatThreadMessagesListSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "List messages in a chat thread",
  },
  createChatThreadMessage: {
    method: "POST",
    path: "/api/v1/chat/threads/:threadId/messages",
    pathParams: z.object({ threadId: z.string() }),
    body: createChatThreadMessageInputSchema,
    responses: {
      201: createChatThreadMessageResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Post a message (Remon as user, or agent API key as assistant reply)",
  },
  deleteChatThreadMessage: {
    method: "DELETE",
    path: "/api/v1/chat/threads/:threadId/messages/:messageId",
    pathParams: z.object({
      threadId: z.string(),
      messageId: z.string(),
    }),
    responses: {
      204: z.void(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Soft-delete one chat message (owner / Access keys only)",
  },
  deleteChatThreadMessages: {
    method: "POST",
    path: "/api/v1/chat/threads/:threadId/messages/delete",
    pathParams: z.object({ threadId: z.string() }),
    body: deleteChatThreadMessagesInputSchema,
    responses: {
      200: deleteChatThreadMessagesResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Soft-delete multiple chat messages (owner / Access keys only)",
  },
});
