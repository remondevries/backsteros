import type {
  EmailAgentCallbackResult,
  EmailAgentIntent,
} from "@backsteros/contracts";

import { newId } from "../lib/crypto.js";
import * as agentmailSettingsService from "./agentmail-settings.js";
import * as emailThreadsService from "./email-threads.js";
import * as meetingService from "./meetings.js";
import * as taskProjectService from "./tasks-projects.js";

export type EmailAgentCallbackRow = {
  workspaceId: string;
  inboxId: string;
  messageId: string;
};

export function resolveEmailAgentSuccessIntent(
  body: Extract<EmailAgentCallbackResult, { ok: true }>,
): EmailAgentIntent | null {
  if (body.intent) return body.intent;
  if (body.body?.trim()) return "reply_draft";
  return null;
}

function appendEmailContext(description: string | null | undefined, input: {
  subject: string;
  from: string;
  messageId: string;
  inboxId: string;
}): string {
  const base = description?.trim() || "";
  const context = [
    "Context from email:",
    `- Subject: ${input.subject || "(none)"}`,
    `- From: ${input.from || "(unknown)"}`,
    `- Message: ${input.inboxId}/${input.messageId}`,
  ].join("\n");
  return base ? `${base}\n\n${context}` : context;
}

async function loadThreadContext(row: EmailAgentCallbackRow): Promise<{
  threadKey: string;
  contactId: string | null;
  assigneeId: string | null;
  projectId: string | null;
  projectKey: string | null;
  subject: string;
  from: string;
}> {
  const message = await agentmailSettingsService
    .getAgentMailMessage(row.workspaceId, row.inboxId, row.messageId)
    .catch(() => null);

  const threadKey = emailThreadsService.resolveEmailThreadKey({
    threadId: message?.threadId ?? null,
    messageId: row.messageId,
  });
  const metadata = await emailThreadsService.getOrCreateEmailThreadMetadata(
    row.workspaceId,
    row.inboxId,
    threadKey,
  );

  return {
    threadKey,
    contactId: metadata.contactId ?? null,
    assigneeId: metadata.assigneeId ?? null,
    projectId: metadata.projectId ?? null,
    projectKey: metadata.projectKey ?? null,
    subject: message?.subject?.trim() || "",
    from: message?.from?.trim() || "",
  };
}

async function postAgentThreadNote(
  row: EmailAgentCallbackRow,
  threadKey: string,
  message: string,
): Promise<void> {
  await emailThreadsService.createEmailThreadComment(
    row.workspaceId,
    row.inboxId,
    threadKey,
    { body: message, author: "agent" },
  );
}

/**
 * Apply a successful Judith callback: reply draft, task, calendar event, or note.
 * Returns the enriched poll result (ids filled in after create).
 */
export async function dispatchEmailAgentCallbackSuccess(input: {
  row: EmailAgentCallbackRow;
  body: Extract<EmailAgentCallbackResult, { ok: true }>;
}): Promise<Extract<EmailAgentCallbackResult, { ok: true }>> {
  const intent = resolveEmailAgentSuccessIntent(input.body);
  if (!intent) {
    throw new Error("Unknown email agent intent");
  }

  if (intent === "reply_draft") {
    const agentBody = input.body.body?.trim() || "";
    if (!agentBody) {
      throw new Error("body is required for reply_draft");
    }
    const draft = await agentmailSettingsService.upsertEmailConceptReply(
      input.row.workspaceId,
      input.row.inboxId,
      input.row.messageId,
      agentBody,
    );
    return {
      ok: true,
      requestId: input.body.requestId,
      intent: "reply_draft",
      body: draft.body?.trim() || agentBody,
      draftId: draft.draftId,
      inboxId: draft.inboxId,
      greeting: draft.greeting ?? null,
      signOff: draft.signOff ?? null,
      subject: draft.subject ?? null,
      to: draft.to ?? [],
    };
  }

  const ctx = await loadThreadContext(input.row);

  if (intent === "task") {
    const taskPayload = input.body.task;
    const title = taskPayload?.title?.trim() || "";
    if (!title) {
      throw new Error("task.title is required for task intent");
    }

    let projectId = ctx.projectId;
    const requestedKey = taskPayload?.projectKey?.trim();
    if (requestedKey) {
      const project = await taskProjectService.getProjectByKey(
        input.row.workspaceId,
        requestedKey.toUpperCase(),
      );
      if (!project) {
        throw new Error(`Project not found for key ${requestedKey.toUpperCase()}`);
      }
      projectId = project.id;
    }

    const description = appendEmailContext(taskPayload?.description, {
      subject: ctx.subject,
      from: ctx.from,
      messageId: input.row.messageId,
      inboxId: input.row.inboxId,
    });

    const created = await taskProjectService.createTask(
      input.row.workspaceId,
      {
        title,
        description,
        projectId,
        contactId: ctx.contactId,
        assigneeId: ctx.assigneeId,
        dueDate: taskPayload?.dueDate ?? null,
        status: "ready_to_start",
        inbox: !projectId,
      },
      newId(),
      undefined,
      { userId: null, kind: "agent" },
      { authKind: "api_key" },
    );
    if (!created) {
      throw new Error("Could not create task");
    }

    let resolvedProjectKey =
      requestedKey?.toUpperCase() ?? ctx.projectKey ?? null;
    if (!resolvedProjectKey && created.projectId) {
      const project = await taskProjectService.getProjectById(
        input.row.workspaceId,
        created.projectId,
      );
      resolvedProjectKey = project?.key ?? null;
    }
    const display = `${resolvedProjectKey ?? "INBOX"}-${created.number}`;
    await postAgentThreadNote(
      input.row,
      ctx.threadKey,
      `Created task ${display}: ${title}`,
    );

    return {
      ok: true,
      requestId: input.body.requestId,
      intent: "task",
      task: {
        title,
        description: taskPayload?.description ?? null,
        projectKey: resolvedProjectKey,
        dueDate: taskPayload?.dueDate ?? null,
        taskId: created.id,
      },
    };
  }

  if (intent === "calendar") {
    const event = input.body.event;
    const title = event?.title?.trim() || "";
    if (!title || !event?.start || !event?.end) {
      throw new Error("event.title, event.start, and event.end are required for calendar intent");
    }

    const meeting = await meetingService.createMeeting(input.row.workspaceId, {
      title,
      notes: event.notes?.trim() || appendEmailContext(null, {
        subject: ctx.subject,
        from: ctx.from,
        messageId: input.row.messageId,
        inboxId: input.row.inboxId,
      }),
      startAt: event.start,
      endAt: event.end,
      projectId: ctx.projectId,
      organizationId: null,
      status: "ready_to_start",
      format: "video_call",
    });

    const when = `${event.start} → ${event.end}`;
    const href = `/calendar/meetings/${encodeURIComponent(meeting.id)}`;
    const displayId =
      meeting.number > 0 ? `M-${meeting.number}` : null;
    const cardPayload = {
      meetingId: meeting.id,
      title,
      href,
      displayId,
      number: meeting.number > 0 ? meeting.number : null,
      startAt: event.start,
      endAt: event.end,
      projectName: null as string | null,
      projectIcon: null as string | null,
      organizationName: null as string | null,
      status: "ready_to_start",
    };
    if (ctx.projectId) {
      const project = await taskProjectService.getProjectById(
        input.row.workspaceId,
        ctx.projectId,
      );
      cardPayload.projectName = project?.name ?? null;
      cardPayload.projectIcon = project?.icon ?? null;
    }
    await postAgentThreadNote(
      input.row,
      ctx.threadKey,
      [
        "```MEETING_CARD",
        JSON.stringify(cardPayload),
        "```",
        "",
        `Added to agenda (${when})`,
      ].join("\n"),
    );

    return {
      ok: true,
      requestId: input.body.requestId,
      intent: "calendar",
      event: {
        title,
        start: event.start,
        end: event.end,
        notes: event.notes ?? null,
        meetingId: meeting.id,
      },
    };
  }

  if (intent === "note") {
    const message = input.body.message?.trim() || "";
    if (!message) {
      throw new Error("message is required for note intent");
    }
    await postAgentThreadNote(input.row, ctx.threadKey, message);
    return {
      ok: true,
      requestId: input.body.requestId,
      intent: "note",
      message,
    };
  }

  throw new Error(`Unsupported email agent intent: ${String(intent)}`);
}
