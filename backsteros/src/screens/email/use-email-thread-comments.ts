import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  AgentMailMessageDetail,
  EmailAgentCoreAction,
  EmailThreadComment,
} from "@backsteros/contracts";
import {
  replySubject as formatReplySubject,
  showAppToast,
  type EmailDraftBodyMode,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";
import { resolveEditableEmailDraftBody } from "../../lib/email-draft-body";
import { dispatchEmailListRemove } from "../../lib/use-agentmail-mailboxes";
import {
  resolveEmailListReturnHref,
  type EmailListReturnHref,
} from "../../lib/email-list-return-href";
import { navigateToHref } from "../../router/navigate-href";

import {
  beginEmailAgentRequest,
  EMAIL_AGENT_DRAFT_START_TIMEOUT_MS,
  emailRequestErrorMessage,
  endEmailAgentRequest,
  resolveEmailThreadKey,
} from "./email-page-helpers";
import { isEmailNotFoundError } from "./email-request-errors";
import { mergeEmailThreadComments } from "./merge-email-thread-comments";

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
  listReturnHref = "/inbox",
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
  /** Where to go after core spam/trash (same as message actions). */
  listReturnHref?: EmailListReturnHref;
  organizationId: string | null;
  contactId: string | null;
  assigneeId: string | null;
  projectKey: string | null;
}) {
  const { client } = useDesktopApi();
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const [threadComments, setThreadComments] = useState<EmailThreadComment[]>(
    [],
  );
  const [commentSending, setCommentSending] = useState(false);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null,
  );
  const commentsMessageIdRef = useRef<string | null>(null);
  /** Soft-deleted locally — keep out of merge so ghosts cannot reappear. */
  const deletedCommentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nextMessageId = message?.messageId ?? null;
    const serverComments = message?.threadComments ?? [];
    if (nextMessageId !== commentsMessageIdRef.current) {
      commentsMessageIdRef.current = nextMessageId;
      deletedCommentIdsRef.current = new Set();
      setThreadComments(serverComments);
      return;
    }
    // Same thread: merge so open-thread refresh cannot drop a just-posted
    // TASK_CARD / meeting card before the server list catches up.
    setThreadComments((current) =>
      mergeEmailThreadComments({
        local: current,
        server: serverComments,
        excludeIds: deletedCommentIdsRef.current,
      }),
    );
  }, [message?.messageId, message?.threadComments]);

  const commentsApiBase = useCallback(() => {
    if (!inboxId || !message) return null;
    const threadKey = resolveEmailThreadKey(message);
    return `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadKey)}/comments`;
  }, [inboxId, message]);

  const postThreadComment = useCallback(
    async (body: string, author: "user" | "agent") => {
      const base = commentsApiBase();
      if (!base) {
        throw new Error("Email thread is not ready to accept comments.");
      }
      const created = await client.requestJson<EmailThreadComment>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author }),
      });
      // Newest-first UIs (Communication email) expect fresh activity at the
      // head; chronological email detail still sorts by createdAt ascending.
      setThreadComments((current) => {
        if (current.some((comment) => comment.id === created.id)) {
          return current;
        }
        return [created, ...current];
      });
      // Keep message.threadComments in sync so the next open-thread refresh
      // fingerprint / merge still sees the card we just posted.
      setMessage((current) => {
        if (!current) return current;
        const existing = current.threadComments ?? [];
        if (existing.some((comment) => comment.id === created.id)) {
          return current;
        }
        return {
          ...current,
          threadComments: [created, ...existing],
        };
      });
      return created;
    },
    [client, commentsApiBase, setMessage],
  );

  const deleteThreadComment = useCallback(
    async (commentId: string) => {
      const base = commentsApiBase();
      if (!base || !commentId.trim()) return;
      setConceptError(null);

      deletedCommentIdsRef.current.add(commentId);
      let removedComment: EmailThreadComment | null = null;
      setThreadComments((current) => {
        removedComment =
          current.find((comment) => comment.id === commentId) ?? null;
        return current.filter((comment) => comment.id !== commentId);
      });
      setMessage((current) => {
        if (!current?.threadComments?.length) return current;
        if (!current.threadComments.some((comment) => comment.id === commentId)) {
          return current;
        }
        return {
          ...current,
          threadComments: current.threadComments.filter(
            (comment) => comment.id !== commentId,
          ),
        };
      });
      setSelectedCommentId((current) =>
        current === commentId ? null : current,
      );

      void client
        .requestJson(`${base}/${encodeURIComponent(commentId)}`, {
          method: "DELETE",
        })
        .catch((caught) => {
          // Already gone on the server — keep optimistic removal (no ghost).
          if (isEmailNotFoundError(caught)) {
            return;
          }
          deletedCommentIdsRef.current.delete(commentId);
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
            setMessage((current) => {
              if (!current) return current;
              const existing = current.threadComments ?? [];
              if (existing.some((comment) => comment.id === removedComment!.id)) {
                return current;
              }
              return {
                ...current,
                threadComments: [...existing, removedComment!],
              };
            });
          }
          setConceptError(
            emailRequestErrorMessage(caught, "Could not delete comment."),
          );
        });
    },
    [client, commentsApiBase, setConceptError, setMessage],
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
          emailRequestErrorMessage(caught, "Could not update comment."),
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
          emailRequestErrorMessage(caught, "Could not save note."),
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
      beginEmailAgentRequest();
      try {
        // Wake Grok immediately — do not wait for the thread comment round-trip.
        void postThreadComment(prompt, "user").catch((caught) => {
          console.warn("[email] agent prompt comment failed:", caught);
        });

        const currentDraftBody =
          resolveEditableEmailDraftBody(message.conceptDraft).trim() || null;

        const clientStartedAt = Date.now();
        const started = await client.requestJson<{
          requestId: string;
          language: "en" | "nl";
          applied?: {
            intent: EmailAgentCoreAction;
            durationMs: number;
            result?: {
              ok: boolean;
              requestId: string;
              intent?: "reply_draft" | "task" | "calendar" | "note";
              body?: string;
              draftId?: string;
              inboxId?: string;
              task?: { title?: string; taskId?: string };
              event?: { title?: string; meetingId?: string };
              message?: string;
              error?: string;
            };
            blockedSender?: string | null;
          };
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/agent-draft`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Cloud forward allows 60s; default client hang timeout is 45s and
            // WebKit reports that as "Fetch is aborted" (esp. while a property
            // patch also refreshes the open thread).
            timeoutMs: EMAIL_AGENT_DRAFT_START_TIMEOUT_MS,
            body: JSON.stringify({
              prompt,
              currentDraftBody,
              ...(options?.intent ? { intent: options.intent } : {}),
            }),
          },
        );

        // Core classify→execute (OS-94): no Judith wake / no poll.
        if (started.applied) {
          const { intent, durationMs } = started.applied;
          const clientMs = Date.now() - clientStartedAt;
          showAppToast({
            message: `Done in ${durationMs}ms (core, no agent) · client ${clientMs}ms`,
            durationMs: 3200,
          });
          if (intent === "spam" || intent === "trash") {
            const nextHref = resolveEmailListReturnHref(listReturnHref, messageId);
            dispatchEmailListRemove({
              inboxId,
              messageId,
              threadId: message.threadId ?? null,
            });
            setMessage(null);
            navigate(nextHref, { replace: true });
            return;
          }
          await reloadMessageDetail?.(inboxId, messageId);
          return;
        }

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
              cc?: string[];
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
                const cc =
                  poll.result.cc?.filter((entry) => entry.trim()) ??
                  message.conceptDraft?.cc ??
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
                      cc,
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
          emailRequestErrorMessage(
            caught,
            "Could not complete agent request.",
          ),
        );
      } finally {
        endEmailAgentRequest();
        setCommentSending(false);
        setDraftStageWorking(false);
      }
    },
    [
      client,
      inboxId,
      listReturnHref,
      message,
      messageId,
      navigate,
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
