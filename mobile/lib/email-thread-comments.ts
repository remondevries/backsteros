import type {
  AgentMailMessageDetail,
  EmailConceptReplyResponse,
  EmailThreadComment,
  Task as ApiTask,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  formatEmailAgentTaskCardComment,
  type EmailAgentCreateTaskSpec,
} from "./agent/email-agent-prompt";
import type { EmailThreadCommentAgentResult } from "./agent/use-email-thread-comment-agent";
import { formatTaskDisplayId, INBOX_TASK_KEY } from "./task-display-id";
import { taskDetailHref } from "./detail-href";

export function resolveEmailThreadKey(
  message: Pick<AgentMailMessageDetail, "threadId" | "messageId">,
): string {
  return message.threadId?.trim() || message.messageId;
}

export function emailThreadCommentsApiBase(
  inboxId: string,
  message: AgentMailMessageDetail,
): string {
  const threadKey = resolveEmailThreadKey(message);
  return `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadKey)}/comments`;
}

export async function postEmailThreadComment(
  client: BacksterosApiClient,
  inboxId: string,
  message: AgentMailMessageDetail,
  body: string,
  author: "user" | "agent",
): Promise<EmailThreadComment> {
  return client.requestJson<EmailThreadComment>(
    emailThreadCommentsApiBase(inboxId, message),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, author }),
    },
  );
}

export type ApplyEmailThreadAgentResultOptions = {
  client: BacksterosApiClient;
  inboxId: string;
  message: AgentMailMessageDetail;
  result: EmailThreadCommentAgentResult;
  projects: readonly {
    id: string;
    name: string | null;
    key: string | null;
  }[];
  postComment: (
    body: string,
    author: "user" | "agent",
  ) => Promise<EmailThreadComment | null>;
  onConceptDraft: (draftId: string, body: string) => void;
  onStatusHint?: (hint: string) => void;
  onError?: (message: string) => void;
  promoteStatus?: (next: "in_progress" | "in_review") => void;
};

/**
 * Apply a quiet comment-agent turn: REPLY_DRAFT / CREATE_TASK / timeline comment.
 */
export async function applyEmailThreadAgentResult(
  options: ApplyEmailThreadAgentResultOptions,
): Promise<void> {
  const {
    client,
    inboxId,
    message,
    result,
    projects,
    postComment,
    onConceptDraft,
    onStatusHint,
    onError,
    promoteStatus,
  } = options;

  if (result.replyDraftBody?.trim()) {
    try {
      const concept = await client.requestJson<EmailConceptReplyResponse>(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(message.messageId)}/concept-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: result.replyDraftBody.trim() }),
        },
      );
      onConceptDraft(concept.draftId, result.replyDraftBody.trim());
      promoteStatus?.("in_review");
      onStatusHint?.("Reply draft ready.");
    } catch (caught) {
      onError?.(
        caught instanceof Error
          ? caught.message
          : "Could not save reply draft.",
      );
    }
  }

  if (result.createTasks.length > 0) {
    const meta = message.threadMetadata;
    const emailHref = `/email/${encodeURIComponent(inboxId)}/${encodeURIComponent(message.messageId)}`;
    const emailLink = {
      id: `link_${Date.now().toString(36)}`,
      url: emailHref,
      createdAt: new Date().toISOString(),
    };
    let noteUsed = false;
    let createdCount = 0;

    for (const spec of result.createTasks) {
      try {
        const project =
          (spec.projectKey
            ? projects.find(
                (entry) =>
                  (entry.key ?? "").toLowerCase() ===
                  spec.projectKey!.trim().toLowerCase(),
              )
            : null) ??
          (meta?.projectId
            ? projects.find((entry) => entry.id === meta.projectId)
            : null) ??
          null;

        const body: Record<string, unknown> = {
          title: spec.title,
          description: spec.description ?? null,
          dueDate: spec.dueDate ?? null,
          priority: spec.priority ?? 0,
          status: spec.status ?? "triage",
          inbox: spec.inbox ?? true,
          projectId: project?.id ?? meta?.projectId ?? null,
          contactId: meta?.contactId ?? null,
          assigneeId: meta?.assigneeId ?? null,
          links: [emailLink],
          activityActor: "agent",
        };

        const created = await client.requestJson<ApiTask>("/api/v1/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const href = taskDetailHref(created.id);
        const displayId =
          project?.key && created.number != null
            ? formatTaskDisplayId(project.key, created.number)
            : created.number != null
              ? formatTaskDisplayId(INBOX_TASK_KEY, created.number)
              : created.title;

        const note =
          !noteUsed && result.commentBody.trim()
            ? result.commentBody.trim()
            : null;
        noteUsed = true;

        await postComment(
          formatEmailAgentTaskCardComment(
            {
              taskId: created.id,
              number: created.number ?? null,
              title: created.title,
              displayId,
              projectKey: project?.key ?? null,
              projectName: project?.name ?? null,
              projectIcon: null,
              dueDate: created.dueDate ?? spec.dueDate ?? null,
              status: created.status ?? spec.status ?? "triage",
              priority: created.priority ?? spec.priority ?? 0,
              href,
            },
            note,
          ),
          "agent",
        );
        createdCount += 1;
        promoteStatus?.("in_progress");
      } catch (caught) {
        onError?.(
          caught instanceof Error
            ? caught.message
            : "Could not create task from email.",
        );
      }
    }

    if (createdCount > 0) {
      onStatusHint?.(
        createdCount === 1
          ? "Task created from email."
          : `${createdCount} tasks created from email.`,
      );
      return;
    }
  }

  if (result.commentBody.trim() && !result.replyDraftBody?.trim()) {
    try {
      await postComment(result.commentBody, "agent");
    } catch (caught) {
      onError?.(
        caught instanceof Error
          ? caught.message
          : "Could not save agent comment.",
      );
    }
  }
}

/** Narrow helper for CREATE_TASK typing re-export. */
export type { EmailAgentCreateTaskSpec };
