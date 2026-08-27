import {
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
  EmailThreadComment,
} from "@backsteros/contracts";
import {
  getEmailComposeHref,
  type EmailMessageSourceDetail,
  type EntityExtraMenuItem,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";
import { writeEmailComposeSession } from "../../lib/email-compose-session";
import { discardEmailMessageDetailCache } from "../../lib/email-message-detail-cache";
import { dispatchEmailListRemove } from "../../lib/use-agentmail-mailboxes";

import { requestMailboxReload } from "./email-page-helpers";
import { navigateToHref } from "../../router/navigate-href";

export function useEmailMessageActions({
  inboxId,
  messageId,
  message,
  setMessage,
  setDraft,
  setThreadComments,
  setConceptError,
  reloadMessageDetail,
  toEmailDetailHref,
}: {
  inboxId: string | undefined;
  messageId: string | undefined;
  message: AgentMailMessageDetail | null;
  setMessage: Dispatch<SetStateAction<AgentMailMessageDetail | null>>;
  setDraft: Dispatch<SetStateAction<AgentMailDraftDetail | null>>;
  setThreadComments: Dispatch<SetStateAction<EmailThreadComment[]>>;
  setConceptError: Dispatch<SetStateAction<string | null>>;
  reloadMessageDetail: (
    messageInboxId: string,
    reloadMessageId: string,
  ) => Promise<AgentMailMessageDetail>;
  toEmailDetailHref: (
    targetInboxId: string,
    targetMessageId: string,
  ) => string;
}) {
  const { client } = useDesktopApi();
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );

  const leaveMessageAfterRemoval = useCallback(() => {
    setMessage(null);
    setDraft(null);
    setThreadComments([]);
    navigate("/inbox", { replace: true });
  }, [navigate]);

  const handleDeleteMessage = useCallback(async () => {
    if (!inboxId || !messageId) {
      return { ok: false as const, error: "Message is required." };
    }
    const threadId = message?.threadId?.trim() || null;

    // Optimistic: drop from list + leave detail immediately.
    dispatchEmailListRemove({
      inboxId,
      messageId,
      threadId,
    });
    leaveMessageAfterRemoval();

    void client
      .requestJson(
        `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      )
      .catch((error) => {
        console.warn("[email] delete message failed:", error);
        requestMailboxReload();
      });

    return { ok: true as const };
  }, [
    client,
    inboxId,
    leaveMessageAfterRemoval,
    message?.threadId,
    messageId,
  ]);

  const handleReportSpamMessage = useCallback(
    async (targetMessageId: string) => {
      if (!inboxId || !targetMessageId) {
        return { ok: false as const, error: "Message is required." };
      }
      const threadId = message?.threadId?.trim() || null;

      dispatchEmailListRemove({
        inboxId,
        messageId: targetMessageId,
        threadId,
      });
      leaveMessageAfterRemoval();

      void client
        .requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(targetMessageId)}/report-spam`,
          { method: "POST" },
        )
        .catch((error) => {
          console.warn("[email] report spam failed:", error);
          requestMailboxReload();
        });

      return { ok: true as const };
    },
    [client, inboxId, leaveMessageAfterRemoval, message?.threadId],
  );

  const handleReportSpam = useCallback(async () => {
    if (!messageId) {
      return { ok: false as const, error: "Message is required." };
    }
    return handleReportSpamMessage(messageId);
  }, [handleReportSpamMessage, messageId]);

  const markMessagesUnread = useCallback(
    (ids: string[]) => {
      if (!inboxId || ids.length === 0) return;
      void Promise.allSettled(
        ids.map((id) =>
          client.requestJson(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(id)}/mark-unread`,
            { method: "POST" },
          ),
        ),
      ).then((results) => {
        const firstFailure = results.find(
          (result) => result.status === "rejected",
        );
        if (firstFailure && firstFailure.status === "rejected") {
          console.warn("[email] mark unread failed:", firstFailure.reason);
        }
        requestMailboxReload();
      });
    },
    [client, inboxId],
  );

  const messageSourceCacheRef = useRef(
    new Map<string, Promise<EmailMessageSourceDetail>>(),
  );
  const loadMessageSource = useCallback(
    (sourceInboxId: string, sourceMessageId: string) => {
      const key = `${sourceInboxId}:${sourceMessageId}`;
      const cache = messageSourceCacheRef.current;
      const existing = cache.get(key);
      if (existing) return existing;
      const promise = client
        .requestJson<{
          messageId: string;
          sizeBytes: number;
          headers: { name: string; value: string }[];
          raw: string;
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(sourceInboxId)}/messages/${encodeURIComponent(sourceMessageId)}/source`,
        )
        .then((result) => ({
          sizeBytes: result.sizeBytes,
          headers: result.headers,
          raw: result.raw,
        }))
        .catch((error: unknown) => {
          cache.delete(key);
          throw error;
        });
      cache.set(key, promise);
      return promise;
    },
    [client],
  );

  const startForward = useCallback(
    (entry: {
      subject: string;
      from: string;
      to: string[];
      timestamp: string;
      body: string;
    }) => {
      const subjectText = entry.subject.trim() || "(no subject)";
      const forwardSubject = /^fwd:/i.test(subjectText)
        ? subjectText
        : `Fwd: ${subjectText}`;
      const parsedDate = new Date(entry.timestamp);
      const forwardBody = [
        "---------- Forwarded message ----------",
        `From: ${entry.from}`,
        ...(Number.isNaN(parsedDate.getTime())
          ? []
          : [`Date: ${parsedDate.toLocaleString()}`]),
        `Subject: ${subjectText}`,
        ...(entry.to.length > 0 ? [`To: ${entry.to.join(", ")}`] : []),
        "",
        entry.body,
      ].join("\n");
      writeEmailComposeSession({
        sessionId: crypto.randomUUID(),
        draftId: null,
        inboxId: inboxId || message?.inboxId || null,
        prefill: { subject: forwardSubject, body: forwardBody },
      });
      navigate(getEmailComposeHref());
    },
    [inboxId, message?.inboxId, navigate],
  );

  const handleDeleteThreadMessage = useCallback(
    async (targetMessageId: string) => {
      if (!inboxId || !message) {
        return { ok: false as const, error: "Message is required." };
      }

      const threadId = message.threadId?.trim() || null;
      const threadRows =
        message.threadMessages && message.threadMessages.length > 0
          ? message.threadMessages
          : [
              {
                messageId: message.messageId,
                threadId: message.threadId,
                subject: message.subject,
                from: message.from,
                to: message.to ?? (message.inboxEmail ? [message.inboxEmail] : []),
                timestamp: message.timestamp,
                text: message.text,
                html: message.html,
                extractedText: message.extractedText,
                extractedHtml: message.extractedHtml,
                labels: message.labels,
                inReplyTo: message.inReplyToMessageId ?? null,
              },
            ];
      const remaining = threadRows.filter(
        (entry) => entry.messageId !== targetMessageId,
      );
      const threadRemoved = remaining.length === 0;
      const viewingDeletedMessage = messageId === targetMessageId;
      const reconcileMessageId = viewingDeletedMessage
        ? (remaining[0]?.messageId ?? null)
        : messageId;

      setConceptError(null);

      if (threadRemoved) {
        dispatchEmailListRemove({
          inboxId,
          messageId: targetMessageId,
          threadId,
        });
        leaveMessageAfterRemoval();
      } else {
        setMessage((current) => {
          if (!current) return current;
          const currentRows =
            current.threadMessages && current.threadMessages.length > 0
              ? current.threadMessages
              : null;
          if (!currentRows) return current;
          return {
            ...current,
            threadMessages: currentRows.filter(
              (entry) => entry.messageId !== targetMessageId,
            ),
          };
        });
        if (viewingDeletedMessage) {
          const nextId = remaining[0]?.messageId;
          if (nextId) {
            navigate(toEmailDetailHref(inboxId, nextId), { replace: true });
          }
        }
      }

      discardEmailMessageDetailCache(inboxId, targetMessageId);

      void (async () => {
        try {
          const result = await client.requestJson<{
            ok: true;
            threadRemoved: boolean;
            anchorMessageId: string | null;
          }>(
            `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(targetMessageId)}?scope=message`,
            { method: "DELETE" },
          );

          if (result.threadRemoved) {
            requestMailboxReload();
            return;
          }

          const reloadId = viewingDeletedMessage
            ? (result.anchorMessageId ?? remaining[0]?.messageId ?? null)
            : messageId;
          if (reloadId) {
            try {
              const reloaded = await reloadMessageDetail(inboxId, reloadId);
              setMessage(reloaded);
            } catch {
              // Keep optimistic state; mailbox reload will reconcile.
            }
          }
          requestMailboxReload();
        } catch (error) {
          console.warn("[email] delete thread message failed:", error);
          requestMailboxReload();
          if (!threadRemoved && reconcileMessageId) {
            try {
              const reloaded = await reloadMessageDetail(
                inboxId,
                reconcileMessageId,
              );
              setMessage(reloaded);
            } catch {
              // Keep optimistic state; mailbox reload will reconcile.
            }
          }
          setConceptError(
            error instanceof Error ? error.message : "Could not delete email.",
          );
        }
      })();

      return { ok: true as const };
    },
    [
      client,
      inboxId,
      leaveMessageAfterRemoval,
      message,
      messageId,
      navigate,
      reloadMessageDetail,
      toEmailDetailHref,
    ],
  );

  const emailExtraMenuItems = useMemo((): EntityExtraMenuItem[] => {
    if (!message || !inboxId || !messageId) return [];
    const subjectLabel =
      message.subject.trim() || "this conversation";
    return [
      {
        id: "report-spam",
        label: "Report spam",
        danger: true,
        confirm: {
          entityLabel: `${subjectLabel} (entire thread)`,
          confirmLabel: "Report spam",
          actionVerb: "Report spam for",
        },
        onSelect: handleReportSpam,
      },
    ];
  }, [handleReportSpam, inboxId, message, messageId]);

  return {
    handleDeleteMessage,
    handleReportSpamMessage,
    markMessagesUnread,
    loadMessageSource,
    startForward,
    handleDeleteThreadMessage,
    emailExtraMenuItems,
  };
}
