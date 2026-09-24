import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  AgentMailMessageDetail,
  EmailThreadComment,
} from "@backsteros/contracts";
import { replySubject as formatReplySubject, type EmailDraftBodyMode } from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";
import { resolveEditableEmailDraftBody } from "../../lib/email-draft-body";

import { resolveEmailThreadKey } from "./email-page-helpers";

/** Fast then back off so we notice Grok finishing without hammering forever. */
const AGENT_DRAFT_POLL_INTERVALS_MS = [
  400, 400, 400, 400, 400, 600, 800, 1000, 1500,
] as const;

function agentDraftPollDelayMs(attempt: number): number {
  const last = AGENT_DRAFT_POLL_INTERVALS_MS.length - 1;
  return AGENT_DRAFT_POLL_INTERVALS_MS[Math.min(attempt, last)]!;
}

export function useEmailThreadComments({
  inboxId,
  messageId,
  message,
  setMessage,
  setConceptError,
  setConceptBodyDraft,
  setReplyComposeOpen,
  setDraftStageWorking,
  promoteEmailThreadStatus,
  reloadMessageDetail,
}: {
  inboxId: string | undefined;
  messageId: string | undefined;
  isCompose: boolean;
  message: AgentMailMessageDetail | null;
  setMessage: Dispatch<SetStateAction<AgentMailMessageDetail | null>>;
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
  reloadMessageDetail?: (
    messageInboxId?: string,
    reloadMessageId?: string,
  ) => void | Promise<unknown>;
  organizationId: string | null;
  contactId: string | null;
  assigneeId: string | null;
  projectKey: string | null;
}) {
  const { client } = useDesktopApi();
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
        removedComment =
          current.find((comment) => comment.id === commentId) ?? null;
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
              if (
                current.some((comment) => comment.id === removedComment!.id)
              ) {
                return current;
              }
              return [...current, removedComment!].sort(
                (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
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
    [client, commentsApiBase, setConceptError],
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
    [client, commentsApiBase, setConceptError],
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

  const handleSubmitThreadNote = useCallback(
    async (body: string) => {
      if (!message || !inboxId) return;
      const prompt = body.trim();
      if (!prompt) return;
      setCommentSending(true);
      setConceptError(null);
      try {
        await postThreadComment(prompt, "user");
      } catch (caught) {
        setConceptError(
          caught instanceof Error
            ? caught.message
            : "Could not save note.",
        );
      } finally {
        setCommentSending(false);
      }
    },
    [inboxId, message, postThreadComment, setConceptError],
  );

  const handleSubmitThreadComment = useCallback(
    async (
      body: string,
      options?: { intent?: "reply_draft" | "task" | "calendar" | "note" },
    ) => {
      if (!message || !inboxId || !messageId) return;
      const prompt = body.trim();
      if (!prompt) return;
      setCommentSending(true);
      setConceptError(null);
      setDraftStageWorking(true);
      promoteEmailThreadStatus("in_progress");
      try {
        // Wake Grok immediately — do not wait for the thread comment round-trip.
        void postThreadComment(prompt, "user").catch((caught) => {
          console.warn("[email] agent prompt comment failed:", caught);
        });

        const currentDraftBody =
          resolveEditableEmailDraftBody(message.conceptDraft).trim() || null;

        const started = await client.requestJson<{
          requestId: string;
          language: "en" | "nl";
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/agent-draft`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              currentDraftBody,
              ...(options?.intent ? { intent: options.intent } : {}),
            }),
          },
        );

        const deadline = Date.now() + 10 * 60 * 1000;
        let pollAttempt = 0;
        while (Date.now() < deadline) {
          const poll = await client.requestJson<{
            pending: boolean;
            result?: {
              ok: boolean;
              requestId: string;
              intent?: "reply_draft" | "task" | "calendar" | "note";
              body?: string;
              draftId?: string;
              inboxId?: string;
              greeting?: string | null;
              signOff?: string | null;
              subject?: string | null;
              to?: string[];
              task?: { title?: string; taskId?: string };
              event?: { title?: string; meetingId?: string };
              message?: string;
              error?: string;
            };
          }>(
            `/api/v1/email/agent-draft-callbacks/${encodeURIComponent(started.requestId)}`,
          );
          if (!poll.pending && poll.result) {
            if (poll.result.ok === false) {
              throw new Error(
                poll.result.error?.trim() ||
                  "Agent could not complete that request.",
              );
            }
            const intent =
              poll.result.intent ??
              (poll.result.body?.trim() ? "reply_draft" : null);
            if (intent === "reply_draft") {
              const nextBody = poll.result.body?.trim() || "";
              const draftId = poll.result.draftId?.trim() || "";
              const draftInboxId =
                poll.result.inboxId?.trim() || inboxId;
              // Body + letter shell first so greeting/sign-off paint with the
              // draft — don't wait for a later message reload / SSE.
              if (nextBody) {
                setConceptBodyDraft(nextBody);
              }
              if (draftId && draftInboxId) {
                const greeting = poll.result.greeting?.trim() || null;
                const signOff = poll.result.signOff?.trim() || null;
                const subject =
                  poll.result.subject?.trim() ||
                  formatReplySubject(message.subject);
                const to =
                  poll.result.to?.filter((entry) => entry.trim()) ??
                  message.conceptDraft?.to ??
                  [];
                setMessage((current) => {
                  if (!current) return current;
                  return {
                    ...current,
                    conceptDraftId: draftId,
                    conceptDraft: {
                      draftId,
                      inboxId: draftInboxId,
                      subject,
                      from: message.conceptDraft?.from ?? null,
                      to,
                      text: message.conceptDraft?.text ?? null,
                      body: nextBody || message.conceptDraft?.body || null,
                      greeting,
                      signOff,
                      preview:
                        (nextBody || message.conceptDraft?.preview || "").slice(
                          0,
                          160,
                        ) || null,
                      updatedAt: new Date().toISOString(),
                    },
                  };
                });
              }
              setDraftStageWorking(false);
              setCommentSending(false);
              setReplyComposeOpen(true);
              // Refine from AgentMail in the background (ids already painted).
              void (async () => {
                try {
                  const reloaded = await reloadMessageDetail?.(
                    inboxId,
                    messageId,
                  );
                  if (
                    reloaded &&
                    typeof reloaded === "object" &&
                    "messageId" in reloaded
                  ) {
                    setMessage(reloaded as AgentMailMessageDetail);
                  }
                } catch (caught) {
                  console.warn("[email] post-agent reload failed:", caught);
                }
              })();
              return;
            }
            // task / calendar / note: server already applied side effects +
            // agent thread notes; refresh before clearing the working state.
            await reloadMessageDetail?.(inboxId, messageId);
            return;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, agentDraftPollDelayMs(pollAttempt)),
          );
          pollAttempt += 1;
        }
        throw new Error("Timed out waiting for the agent.");
      } catch (caught) {
        setConceptError(
          caught instanceof Error
            ? caught.message
            : "Could not complete agent request.",
        );
      } finally {
        setCommentSending(false);
        setDraftStageWorking(false);
      }
    },
    [
      client,
      inboxId,
      message,
      messageId,
      postThreadComment,
      promoteEmailThreadStatus,
      reloadMessageDetail,
      setConceptBodyDraft,
      setConceptError,
      setDraftStageWorking,
      setMessage,
      setReplyComposeOpen,
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
    postThreadComment,
    commentAgentWorking: commentSending,
    draftAgentWorking: false,
    handleSubmitThreadNote,
    handleSubmitThreadComment,
  };
}
