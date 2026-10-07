/**
 * Apply fixed email-thread commands in core without waking Judith (OS-94).
 */

import type {
  EmailAgentCallbackResult,
  EmailAgentCoreAction,
} from "@backsteros/contracts";

import type { EmailCoreExecutableIntent } from "../lib/email-command-intent.js";
import { dispatchEmailAgentCallbackSuccess } from "./email-agent-callback-dispatch.js";
import * as emailThreadsService from "./email-threads.js";

async function agentmailSettings() {
  return import("./agentmail-settings.js");
}

const DEFAULT_MEETING_DURATION_MS = 30 * 60_000;
const MEETING_START_STEP_MS = 15 * 60_000;

export type EmailCommandExecuteResult = {
  intent: EmailAgentCoreAction;
  result?: EmailAgentCallbackResult;
  blockedSender?: string | null;
};

function defaultMeetingWindow(now = new Date()): {
  start: string;
  end: string;
} {
  const startAt = new Date(
    Math.ceil((now.getTime() + 60 * 60_000) / MEETING_START_STEP_MS) *
      MEETING_START_STEP_MS,
  );
  return {
    start: startAt.toISOString(),
    end: new Date(startAt.getTime() + DEFAULT_MEETING_DURATION_MS).toISOString(),
  };
}

async function loadMessageSubject(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): Promise<string> {
  try {
    const message = await (await agentmailSettings()).getAgentMailMessage(
      workspaceId,
      inboxId,
      messageId,
    );
    return message.subject?.trim() || "Email";
  } catch {
    return "Email";
  }
}

export async function executeEmailCommandInCore(input: {
  workspaceId: string;
  inboxId: string;
  messageId: string;
  intent: EmailCoreExecutableIntent;
  noteMessage?: string;
  requestId: string;
}): Promise<EmailCommandExecuteResult> {
  const { workspaceId, inboxId, messageId, intent, requestId } = input;
  const mail = await agentmailSettings();

  if (intent === "spam") {
    const spam = await mail.reportAgentMailMessageSpam(
      workspaceId,
      inboxId,
      messageId,
    );
    return { intent, blockedSender: spam.blockedSender };
  }

  if (intent === "trash") {
    await mail.deleteAgentMailMessage(workspaceId, inboxId, messageId);
    return { intent };
  }

  if (intent === "archive") {
    const message = await mail.getAgentMailMessage(
      workspaceId,
      inboxId,
      messageId,
    );
    const threadKey = emailThreadsService.resolveEmailThreadKey({
      threadId: message.threadId,
      messageId,
    });
    await emailThreadsService.updateEmailThreadMetadata(
      workspaceId,
      inboxId,
      threadKey,
      { status: "completed" },
    );
    await mail.syncAgentMailEmailStatusLabel(
      workspaceId,
      inboxId,
      threadKey,
      "completed",
    );
    return { intent };
  }

  if (intent === "mark_read") {
    await mail.markAgentMailMessageRead(workspaceId, inboxId, messageId);
    return { intent };
  }

  if (intent === "mark_unread") {
    await mail.markAgentMailMessageUnread(workspaceId, inboxId, messageId);
    return { intent };
  }

  if (intent === "task") {
    const title = await loadMessageSubject(workspaceId, inboxId, messageId);
    const result = await dispatchEmailAgentCallbackSuccess({
      row: { workspaceId, inboxId, messageId },
      body: {
        ok: true,
        requestId,
        intent: "task",
        task: { title },
      },
    });
    return { intent, result };
  }

  if (intent === "calendar") {
    const title = await loadMessageSubject(workspaceId, inboxId, messageId);
    const window = defaultMeetingWindow();
    const result = await dispatchEmailAgentCallbackSuccess({
      row: { workspaceId, inboxId, messageId },
      body: {
        ok: true,
        requestId,
        intent: "calendar",
        event: { title, start: window.start, end: window.end },
      },
    });
    return { intent, result };
  }

  if (intent === "note") {
    const message = input.noteMessage?.trim() || "";
    if (!message) throw new Error("note message is required");
    const result = await dispatchEmailAgentCallbackSuccess({
      row: { workspaceId, inboxId, messageId },
      body: {
        ok: true,
        requestId,
        intent: "note",
        message,
      },
    });
    return { intent, result };
  }

  throw new Error(`Unsupported core email command: ${String(intent)}`);
}
