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
import type { EmailDraftBodyMode } from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";

import { resolveEmailThreadKey } from "./email-page-helpers";

export function useEmailThreadComments({
  inboxId,
  messageId,
  message,
  setConceptError,
  promoteEmailThreadStatus,
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

  const handleSubmitThreadComment = useCallback(
    async (body: string) => {
      if (!message) return;
      setCommentSending(true);
      setConceptError(null);
      promoteEmailThreadStatus("in_progress");
      try {
        // Desktop Agent Chat / email ACP removed (BOD-49) — comments stay user-authored.
        await postThreadComment(body, "user");
      } catch (caught) {
        setConceptError(
          caught instanceof Error ? caught.message : "Could not post comment.",
        );
      } finally {
        setCommentSending(false);
      }
    },
    [message, postThreadComment, promoteEmailThreadStatus, setConceptError],
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
    commentAgentWorking: false,
    draftAgentWorking: false,
    handleSubmitThreadComment,
  };
}
