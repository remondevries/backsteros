import type {
  EmailListItem,
  EmailMailbox,
  TaskItemRowTask,
  TaskStatus,
} from "@backsteros/ui";
import {
  buildTaskListEmailItem,
  emailMailboxLabel,
  getEmailTaskListHref,
  isEmailTaskListItem,
  resolveEmailThreadMetadataKey,
} from "@backsteros/ui";

import { dispatchEmailListPatch } from "./use-agentmail-mailboxes";

export function resolveMailboxListMeta(
  inboxId: string,
  mailboxes: readonly EmailMailbox[],
  mailboxById?: ReadonlyMap<string, EmailMailbox>,
): { label: string | null; avatarSrc: string | null } {
  const mailbox =
    mailboxById?.get(inboxId) ??
    mailboxes.find((entry) => entry.inboxId === inboxId) ??
    null;
  if (!mailbox) return { label: null, avatarSrc: null };
  return {
    label: emailMailboxLabel(mailbox),
    avatarSrc: mailbox.avatarSrc ?? null,
  };
}

export function buildMailboxByIdMap(
  mailboxes: readonly EmailMailbox[],
): Map<string, EmailMailbox> {
  return new Map(mailboxes.map((mailbox) => [mailbox.inboxId, mailbox]));
}

export function mapEmailMessagesToTaskRows(
  messages: readonly EmailListItem[],
  mailboxes: readonly EmailMailbox[] = [],
): TaskItemRowTask[] {
  const mailboxById = buildMailboxByIdMap(mailboxes);
  return messages.map((item) => {
    const mailbox = resolveMailboxListMeta(item.inboxId, mailboxes, mailboxById);
    return buildTaskListEmailItem({
      inboxId: item.inboxId,
      messageId: item.id,
      draftId: item.draftId ?? (item.kind === "draft" ? item.id : null),
      threadId: item.threadId,
      title: item.subject,
      from: item.from,
      status: item.status,
      priority: item.priority,
      dueDate: item.dueDate,
      updatedAt: item.receivedAt,
      assigneeId: item.assigneeId,
      projectId: item.projectId,
      projectKey: item.projectKey,
      projectName: item.projectName,
      contactId: item.contactId,
      contactName: item.contactName,
      mailboxLabel: mailbox.label,
      mailboxAvatarSrc: mailbox.avatarSrc,
      emailThreadId: item.emailThreadId,
      number: item.number,
      displayId: item.displayId,
      unread: item.unread === true,
    });
  });
}

export function filterEmailTaskRowsForProject(
  emails: readonly TaskItemRowTask[],
  project: { id: string; key: string },
): TaskItemRowTask[] {
  const key = project.key.trim().toLowerCase();
  return emails.filter((email) => {
    if (email.projectId && email.projectId === project.id) return true;
    if (email.projectKey?.trim().toLowerCase() === key) return true;
    return false;
  });
}

export { getEmailTaskListHref, isEmailTaskListItem };

type RequestJsonClient = {
  requestJson: <T>(
    path: string,
    init?: RequestInit & { signal?: AbortSignal },
  ) => Promise<T>;
};

export type EmailTaskListMetadataPatch = {
  status?: TaskStatus | string;
  priority?: number;
  dueDate?: string | null;
  projectId?: string | null;
  assigneeId?: string | null;
};

export type EmailTaskListPatchExtras = {
  projectName?: string | null;
  projectKey?: string | null;
  assigneeName?: string | null;
};

export async function patchEmailTaskListItem(
  client: RequestJsonClient,
  task: TaskItemRowTask,
  patch: EmailTaskListMetadataPatch,
  listExtras?: EmailTaskListPatchExtras,
): Promise<void> {
  if (!isEmailTaskListItem(task) || !task.emailInboxId) return;
  const messageId = task.emailMessageId?.trim() || "";
  // Metadata API :threadKey is AgentMail thread id (`email_threads.thread_key`),
  // never the workspace row id (`email_threads.id` / emailThreadId). Using the
  // DB id wrote a forked row; list reload still joined the AgentMail key and
  // snapped project/priority back.
  const agentMailThreadId = task.emailThreadKey?.trim() || null;
  const threadKey = resolveEmailThreadMetadataKey({
    kind: task.emailDraftId ? "draft" : "message",
    draftId: task.emailDraftId,
    threadId: agentMailThreadId,
    messageId,
  });
  if (!threadKey || !messageId) return;

  // Optimistic list update first — Communication / Inbox rails bind property
  // dropdowns to list rows; waiting on the API made project/priority snap back.
  const listPatch = {
    inboxId: task.emailInboxId,
    messageId,
    threadId: agentMailThreadId,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
    ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
    ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
    ...(listExtras?.projectName !== undefined
      ? { projectName: listExtras.projectName }
      : {}),
    ...(listExtras?.projectKey !== undefined
      ? { projectKey: listExtras.projectKey }
      : {}),
    ...(listExtras?.assigneeName !== undefined
      ? { assigneeName: listExtras.assigneeName }
      : {}),
  };
  dispatchEmailListPatch(listPatch);

  try {
    await client.requestJson(
      `/api/v1/email/inboxes/${encodeURIComponent(task.emailInboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
  } catch (error) {
    // Re-assert the optimistic values after a failed request so a concurrent
    // list reload cannot leave the UI on a half-applied server row forever.
    // Callers may still surface the error; the rail keeps the user's choice.
    dispatchEmailListPatch(listPatch);
    throw error;
  }
}
