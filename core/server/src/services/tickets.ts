/**
 * OS-187: support tickets = tasks with support:true, plus email-thread helpers.
 * Ticket/comment writes never send mail.
 */
import type {
  CreateTicketFromEmailInput,
  CreateTicketInput,
  CreateTaskInput,
  UpdateTicketInput,
  UpdateTaskInput,
} from "@backsteros/contracts";
import { normalizeTicketStatus } from "@backsteros/contracts";

import { AgentMailClient } from "../lib/agentmail-client.js";
import { getAgentMailCredentials } from "./agentmail-settings/settings.js";
import {
  resolveEmailThreadRowForAgentMail,
  syncTicketLinkedEmails,
  type TicketEmailSyncDeps,
} from "./ticket-email-sync.js";
import * as taskProjectService from "./tasks-projects.js";

/** Force support:true; map waiting_on_client → waiting. Never sends mail. */
export function ticketCreateFields(body: CreateTicketInput): CreateTaskInput {
  const { status, ...rest } = body;
  return {
    ...rest,
    ...(status != null ? { status: normalizeTicketStatus(status) } : {}),
    support: true,
  };
}

export function ticketUpdateFields(body: UpdateTicketInput): UpdateTaskInput {
  const { status, support, ...rest } = body;
  const next: UpdateTaskInput = { ...rest };
  if (status != null) {
    next.status = normalizeTicketStatus(status);
  }
  // Tickets stay tickets — ignore attempts to clear support.
  if (support === true) {
    next.support = true;
  }
  return next;
}

export async function createTicketFromEmail(
  workspaceId: string,
  input: CreateTicketFromEmailInput,
  options?: {
    activityActor?: "user" | "agent";
    authorContactId?: string | null;
    deps?: TicketEmailSyncDeps;
  },
) {
  void options?.deps?.sendMail;

  const inboxId = input.inboxId.trim();
  const threadId = input.threadId.trim();
  if (!inboxId || !threadId) {
    return { ok: false as const, code: "bad_request" as const, error: "inboxId and threadId are required" };
  }

  let title = input.title?.trim() || "";
  if (!title) {
    try {
      const { apiKey } = await getAgentMailCredentials(workspaceId);
      if (apiKey) {
        const client = new AgentMailClient({ apiKey });
        const thread = await client.getThread(inboxId, threadId);
        title = thread.subject?.trim() || "";
      }
    } catch {
      // fall through to default title
    }
  }
  if (!title) title = `Support thread ${threadId}`;

  const thread = await resolveEmailThreadRowForAgentMail({
    workspaceId,
    inboxId,
    threadId,
    createIfMissing: true,
  });
  if (!thread) {
    return {
      ok: false as const,
      code: "not_found" as const,
      error: "Email thread",
    };
  }

  const status =
    input.status != null ? normalizeTicketStatus(input.status) : undefined;
  const relatedOrganizationIds = [
    ...(input.relatedOrganizationIds ?? []),
    ...(input.organizationId ? [input.organizationId] : []),
  ];
  const relatedContactIds = [
    ...(input.relatedContactIds ?? []),
    ...(input.contactId ? [input.contactId] : []),
  ];

  const created = await taskProjectService.createTask(
    workspaceId,
    ticketCreateFields({
      title,
      description: input.description ?? null,
      projectId: input.projectId,
      projectKey: input.projectKey,
      contactId: input.contactId ?? null,
      assigneeId: input.assigneeId,
      relatedContactIds:
        relatedContactIds.length > 0 ? [...new Set(relatedContactIds)] : undefined,
      relatedOrganizationIds:
        relatedOrganizationIds.length > 0
          ? [...new Set(relatedOrganizationIds)]
          : undefined,
      linkedEmailIds: [thread.id],
      status,
      priority: input.priority,
      support: true,
      activityActor: input.activityActor ?? options?.activityActor ?? "agent",
    }),
  );

  let sync = undefined;
  if (input.backfill !== false) {
    sync =
      (await syncTicketLinkedEmails({
        workspaceId,
        taskId: created.id,
        backfill: true,
        activityActor: input.activityActor ?? options?.activityActor ?? "agent",
        authorContactId: options?.authorContactId ?? null,
        deps: options?.deps,
      })) ?? undefined;
  }

  const ticket = await taskProjectService.getTaskById(workspaceId, created.id);
  if (!ticket) {
    return {
      ok: false as const,
      code: "internal" as const,
      error: "Ticket create failed",
    };
  }

  return {
    ok: true as const,
    ticket,
    sync,
    sentMail: false as const,
  };
}
