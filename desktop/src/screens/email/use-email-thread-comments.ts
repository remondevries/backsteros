import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  AgentMailMessageDetail,
  EmailThreadComment,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  formatTaskDisplayId,
  getEmailItemHref,
  INBOX_TASK_KEY,
  resolveDuplicatedTaskHref,
  type EmailDraftBodyMode,
} from "@backsteros/ui";

import {
  emailAgentTaskId,
  extractAgentReplyBody,
  formatEmailAgentTaskCardComment,
  type EmailAgentCreateTaskSpec,
} from "../../lib/agent/email-agent-prompt";
import { useEmailThreadCommentAgent } from "../../lib/agent/use-email-thread-comment-agent";
import { useDesktopApi } from "../../lib/api-context";
import { useDesktopWorkspaceData } from "../../lib/workspace-data";

import { resolveEmailThreadKey } from "./email-page-helpers";

export function useEmailThreadComments({
  inboxId,
  messageId,
  isCompose,
  message,
  conceptBodyDraft,
  conceptBodyMode,
  replyComposeOpen,
  setConceptError,
  setConceptBodyDraft,
  setReplyComposeOpen,
  setDraftStageWorking,
  saveConceptDraftBody,
  saveConceptReply,
  promoteEmailThreadStatus,
  organizationId,
  contactId,
  assigneeId,
  projectKey,
}: {
  inboxId: string | undefined;
  messageId: string | undefined;
  isCompose: boolean;
  message: AgentMailMessageDetail | null;
  conceptBodyDraft: string;
  conceptBodyMode: EmailDraftBodyMode;
  replyComposeOpen: boolean;
  setConceptError: Dispatch<SetStateAction<string | null>>;
  setConceptBodyDraft: Dispatch<SetStateAction<string>>;
  setReplyComposeOpen: Dispatch<SetStateAction<boolean>>;
  setDraftStageWorking: Dispatch<SetStateAction<boolean>>;
  saveConceptDraftBody: (
    targetInboxId: string,
    targetDraftId: string,
    body: string,
  ) => Promise<void>;
  saveConceptReply: (body: string) => Promise<void>;
  promoteEmailThreadStatus: (
    next: "in_progress" | "in_review" | "on_hold",
  ) => void;
  organizationId: string | null;
  contactId: string | null;
  assigneeId: string | null;
  projectKey: string | null;
}) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const { organizations, contacts, projects } = workspace;
  const [threadComments, setThreadComments] = useState<EmailThreadComment[]>(
    [],
  );
  const [commentSending, setCommentSending] = useState(false);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setThreadComments(message?.threadComments ?? []);
  }, [message?.messageId, message?.threadComments]);

  const messageWithComments = useMemo(() => {
    if (!message) return null;
    return { ...message, threadComments };
  }, [message, threadComments]);

  const taskId = useMemo(() => {
    if (!inboxId || !messageId) return null;
    return emailAgentTaskId(inboxId, messageId);
  }, [inboxId, messageId]);

  const commentsApiBase = useCallback(() => {
    if (!inboxId || !message) return null;
    const threadKey = resolveEmailThreadKey(message);
    return `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadKey)}/comments`;
  }, [inboxId, message]);

  const postThreadComment = useCallback(
    async (body: string, author: "user" | "agent") => {
      const base = commentsApiBase();
      if (!base) return null;
      const created = await client.requestJson<EmailThreadComment>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author }),
      });
      setThreadComments((current) => [...current, created]);
      return created;
    },
    [client, commentsApiBase],
  );

  const deleteThreadComment = useCallback(
    async (commentId: string) => {
      const base = commentsApiBase();
      if (!base || !commentId.trim()) return;
      setConceptError(null);

      let removedComment: EmailThreadComment | null = null;
      setThreadComments((current) => {
        removedComment = current.find((comment) => comment.id === commentId) ?? null;
        return current.filter((comment) => comment.id !== commentId);
      });
      setSelectedCommentId((current) =>
        current === commentId ? null : current,
      );

      void client
        .requestJson(`${base}/${encodeURIComponent(commentId)}`, {
          method: "DELETE",
        })
        .catch((caught) => {
          if (removedComment) {
            setThreadComments((current) => {
              if (current.some((comment) => comment.id === removedComment!.id)) {
                return current;
              }
              return [...current, removedComment!].sort(
                (a, b) =>
                  Date.parse(a.createdAt) - Date.parse(b.createdAt),
              );
            });
          }
          setConceptError(
            caught instanceof Error
              ? caught.message
              : "Could not delete comment.",
          );
        });
    },
    [client, commentsApiBase],
  );

  const updateThreadComment = useCallback(
    async (commentId: string, body: string) => {
      const base = commentsApiBase();
      if (!base || !commentId.trim()) return;
      setSavingCommentId(commentId);
      setConceptError(null);
      try {
        const updated = await client.requestJson<EmailThreadComment>(
          `${base}/${encodeURIComponent(commentId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          },
        );
        setThreadComments((current) =>
          current.map((comment) =>
            comment.id === commentId ? updated : comment,
          ),
        );
        setSelectedCommentId(null);
      } catch (caught) {
        setConceptError(
          caught instanceof Error
            ? caught.message
            : "Could not update comment.",
        );
      } finally {
        setSavingCommentId(null);
      }
    },
    [client, commentsApiBase],
  );

  useEffect(() => {
    if (!selectedCommentId) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-email-comment-bubble]")) return;
      setSelectedCommentId(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedCommentId(null);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [selectedCommentId]);

  useEffect(() => {
    setSelectedCommentId(null);
  }, [messageId]);

  const handleCommentAgentResult = useCallback(
    async (result: {
      commentBody: string;
      replyDraftBody: string | null;
      createTasks: EmailAgentCreateTaskSpec[];
      intent: "comment" | "revise-draft";
    }) => {
      if (result.intent === "revise-draft") {
        const nextBody =
          result.replyDraftBody?.trim() ||
          extractAgentReplyBody(result.commentBody) ||
          result.commentBody.trim();
        if (!nextBody) {
          setConceptError("Agent did not return an updated draft.");
          return;
        }
        setConceptError(null);
        setConceptBodyDraft(nextBody);
        setReplyComposeOpen(true);
        const targetInboxId =
          message?.conceptDraft?.inboxId?.trim() ||
          inboxId?.trim() ||
          "";
        const targetDraftId =
          message?.conceptDraft?.draftId?.trim() ||
          message?.conceptDraftId?.trim() ||
          "";
        try {
          if (targetInboxId && targetDraftId) {
            await saveConceptDraftBody(targetInboxId, targetDraftId, nextBody);
          } else {
            await saveConceptReply(nextBody);
          }
          promoteEmailThreadStatus("in_review");
        } catch {
          // saveConceptDraftBody / saveConceptReply already surface errors.
        }
        return;
      }

      // Draft-only turns: show the reply email, never an acknowledgment comment.
      if (result.replyDraftBody?.trim()) {
        setConceptError(null);
        setReplyComposeOpen(true);
        // Preview/comment turns only animate once we know a draft update landed.
        setDraftStageWorking(true);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 280);
        });
        try {
          await saveConceptReply(result.replyDraftBody);
          promoteEmailThreadStatus("in_review");
        } finally {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 48);
          });
          setDraftStageWorking(false);
        }
        // Fall through — agent may also create tasks in the same turn.
      }

      if (result.createTasks.length > 0 && message && inboxId) {
        const meta = message.threadMetadata;
        const emailHref = getEmailItemHref(inboxId, message.messageId);
        const emailLink = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `link_${Date.now()}`,
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
                      entry.key.toLowerCase() ===
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
            const href = resolveDuplicatedTaskHref({
              id: created.id,
              number: created.number ?? null,
              projectKey: project?.key ?? null,
            });
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
            await postThreadComment(
              formatEmailAgentTaskCardComment(
                {
                  taskId: created.id,
                  number: created.number ?? null,
                  title: created.title,
                  displayId,
                  projectKey: project?.key ?? null,
                  projectName: project?.name ?? null,
                  projectIcon: project?.icon ?? null,
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
            promoteEmailThreadStatus("in_progress");
          } catch (caught) {
            setConceptError(
              caught instanceof Error
                ? caught.message
                : "Could not create task from email.",
            );
          }
        }
        if (createdCount > 0) return;
      }

      if (result.commentBody.trim() && !result.replyDraftBody?.trim()) {
        try {
          await postThreadComment(result.commentBody, "agent");
        } catch (caught) {
          setConceptError(
            caught instanceof Error
              ? caught.message
              : "Could not save agent comment.",
          );
        }
      }
    },
    [
      client,
      inboxId,
      message,
      postThreadComment,
      projects,
      promoteEmailThreadStatus,
      saveConceptDraftBody,
      saveConceptReply,
    ],
  );

  const {
    sendComment: sendCommentToAgent,
    working: commentAgentWorking,
    revisingDraft: draftAgentWorking,
    error: commentAgentError,
  } = useEmailThreadCommentAgent({
    taskId: isCompose ? null : taskId,
    message: isCompose ? null : messageWithComments,
    onResult: handleCommentAgentResult,
    enabled: !isCompose,
  });

  useEffect(() => {
    if (!commentAgentError) return;
    setDraftStageWorking(false);
    setConceptError(commentAgentError);
  }, [commentAgentError]);

  const handleSubmitThreadComment = useCallback(
    async (body: string) => {
      if (!message) return;
      setCommentSending(true);
      setConceptError(null);
      promoteEmailThreadStatus("in_progress");

      const assignee = assigneeId
        ? contacts.find((entry) => entry.id === assigneeId) ?? null
        : null;
      const organization = organizationId
        ? organizations.find((entry) => entry.id === organizationId) ?? null
        : null;
      const contact = contactId
        ? contacts.find((entry) => entry.id === contactId) ?? null
        : null;
      const project = projectKey
        ? projects.find((entry) => entry.key === projectKey) ?? null
        : null;
      const existingDraft = message.conceptDraft;
      const agentMessage: AgentMailMessageDetail = {
        ...message,
        threadComments: threadComments,
        threadMetadata: message.threadMetadata
          ? {
              ...message.threadMetadata,
              contactId,
              contactName:
                contact?.name ?? message.threadMetadata.contactName ?? null,
              organizationId,
              organizationName:
                organization?.name ??
                message.threadMetadata.organizationName ??
                null,
              assigneeId,
              assigneeName:
                assignee?.name ?? message.threadMetadata.assigneeName ?? null,
              projectId: project?.id ?? message.threadMetadata.projectId,
              projectName:
                project?.name ?? message.threadMetadata.projectName ?? null,
              projectKey:
                project?.key ?? message.threadMetadata.projectKey ?? null,
            }
          : message.threadMetadata,
        conceptDraft: existingDraft
          ? {
              ...existingDraft,
              body: conceptBodyDraft.trim() || existingDraft.body,
            }
          : existingDraft,
      };

      const reviseDraft =
        conceptBodyMode === "edit" &&
        Boolean(
          existingDraft?.draftId?.trim() ||
            message.conceptDraftId?.trim() ||
            replyComposeOpen,
        );

      try {
        if (reviseDraft) {
          await sendCommentToAgent(body, {
            message: agentMessage,
            intent: "revise-draft",
            draftBody: conceptBodyDraft,
          });
          return;
        }

        const created = await postThreadComment(body, "user");
        const nextComments = created
          ? [...threadComments, created]
          : threadComments;
        await sendCommentToAgent(body, {
          message: {
            ...agentMessage,
            threadComments: nextComments,
          },
        });
      } catch (caught) {
        setConceptError(
          caught instanceof Error ? caught.message : "Could not post comment.",
        );
      } finally {
        setCommentSending(false);
      }
    },
    [
      assigneeId,
      conceptBodyDraft,
      conceptBodyMode,
      contactId,
      contacts,
      message,
      organizationId,
      organizations,
      postThreadComment,
      projectKey,
      projects,
      promoteEmailThreadStatus,
      replyComposeOpen,
      sendCommentToAgent,
      threadComments,
    ],
  );

  return {
    threadComments,
    setThreadComments,
    commentSending,
    savingCommentId,
    selectedCommentId,
    setSelectedCommentId,
    deleteThreadComment,
    updateThreadComment,
    commentAgentWorking,
    draftAgentWorking,
    handleSubmitThreadComment,
  };
}
