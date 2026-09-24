import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
} from "@backsteros/contracts";
import {
  applyAgentMailReadStateLabels,
  emailMessageHtmlBody,
  isAgentMailMessageUnread,
  resolveEmailInlineAttachments,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";
import {
  useCloudClientNotices,
} from "../../lib/cloud-client-notices";
import { prefetchInlineAttachmentBlob } from "../../lib/email-inline-attachment-cache.js";
import {
  fetchEmailDraftDetail,
  fetchEmailMessageDetail,
  peekEmailDraftDetailCache,
  peekEmailMessageDetailCache,
  writeEmailDraftDetailCache,
  writeEmailMessageDetailCache,
} from "../../lib/email-message-detail-cache";
import {
  dispatchEmailListPatch,
  EMAIL_INBOX_UPDATED_EVENT,
  type EmailInboxUpdatedDetail,
} from "../../lib/use-agentmail-mailboxes";
import { WORKSPACE_EMAIL_UPDATED_EVENT } from "../../lib/workspace-events";

/** Catch-up while email SSE is live (SSE + events are primary). */
const OPEN_THREAD_CATCHUP_POLL_MS = 60_000;
/** Faster catch-up when the email stream is off / degraded. */
const OPEN_THREAD_DEGRADED_POLL_MS = 15_000;

export function useEmailMessageDetail({
  inboxId,
  messageId,
  draftId,
  isCompose,
}: {
  inboxId: string | undefined;
  messageId: string | undefined;
  draftId: string | undefined;
  isCompose: boolean;
}) {
  const { client } = useDesktopApi();
  const cloudNotices = useCloudClientNotices();
  const openThreadPollMs =
    cloudNotices.email === "live"
      ? OPEN_THREAD_CATCHUP_POLL_MS
      : OPEN_THREAD_DEGRADED_POLL_MS;
  const initialCachedMessage =
    inboxId && messageId && !draftId
      ? peekEmailMessageDetailCache(inboxId, messageId)
      : null;
  const initialCachedDraft =
    inboxId && draftId ? peekEmailDraftDetailCache(inboxId, draftId) : null;
  const [message, setMessage] = useState<AgentMailMessageDetail | null>(
    initialCachedMessage,
  );
  const [draft, setDraft] = useState<AgentMailDraftDetail | null>(
    initialCachedDraft,
  );
  const [loading, setLoading] = useState(
    Boolean(inboxId && (messageId || draftId)) &&
      !initialCachedMessage &&
      !initialCachedDraft,
  );
  const [error, setError] = useState<string | null>(null);
  /** Once per opened message — avoid re-marking read after explicit mark-unread. */
  const autoMarkedReadKeyRef = useRef<string | null>(null);
  /** Set by mark-unread while the thread is still open. */
  const suppressAutoMarkReadRef = useRef(false);

  const coerceOpenedMessageRead = useCallback(
    (detail: AgentMailMessageDetail, detailInboxId: string) => {
      const key = `${detailInboxId}\0${detail.messageId}`;
      if (suppressAutoMarkReadRef.current) return detail;
      if (autoMarkedReadKeyRef.current !== key) return detail;
      return {
        ...detail,
        labels: applyAgentMailReadStateLabels(detail.labels, false),
        threadMessages: detail.threadMessages?.map((entry) => ({
          ...entry,
          labels: applyAgentMailReadStateLabels(entry.labels, false),
        })),
      };
    },
    [],
  );

  const suppressAutoMarkRead = useCallback(() => {
    suppressAutoMarkReadRef.current = true;
    autoMarkedReadKeyRef.current = null;
  }, []);

  useEffect(() => {
    suppressAutoMarkReadRef.current = false;
    autoMarkedReadKeyRef.current = null;
  }, [inboxId, messageId]);

  const reloadMessageDetail = useCallback(
    async (messageInboxId: string, reloadMessageId: string) => {
      const detail = await fetchEmailMessageDetail(
        client,
        messageInboxId,
        reloadMessageId,
        { force: true },
      );
      if (!detail) {
        throw new Error("Could not reload message.");
      }
      return detail;
    },
    [client],
  );

  // Keep the open thread in sync when AgentMail delivers mail (SSE) or when
  // the side-panel poll is the only live path (SSE dropped).
  useEffect(() => {
    if (!inboxId || !messageId || isCompose) return;
    const detailFingerprint = (detail: AgentMailMessageDetail) =>
      [
        detail.messageId,
        detail.timestamp ?? "",
        detail.conceptDraftId ?? "",
        detail.conceptDraft?.updatedAt ?? "",
        detail.threadComments?.length ?? 0,
        detail.threadMessages
          ?.map(
            (entry) =>
              `${entry.messageId}:${(entry.attachments ?? [])
                .map((attachment) => attachment.attachmentId)
                .join(",")}`,
          )
          .join("|") ?? "",
        detail.threadMetadata?.status ?? "",
        detail.threadMetadata?.priority ?? "",
        detail.threadMetadata?.dueDate ?? "",
        detail.threadMetadata?.projectId ?? "",
        detail.threadMetadata?.assigneeId ?? "",
        detail.threadMetadata?.contactId ?? "",
        detail.threadMetadata?.organizationId ?? "",
      ].join("|");
    let lastFingerprint = "";
    const refreshOpenThread = () => {
      void reloadMessageDetail(inboxId, messageId)
        .then((reloaded) => {
          const nextFingerprint = detailFingerprint(reloaded);
          if (nextFingerprint === lastFingerprint) return;
          lastFingerprint = nextFingerprint;
          setMessage(coerceOpenedMessageRead(reloaded, inboxId));
        })
        .catch(() => {});
    };
    const onInboxUpdated = (event: Event) => {
      const detail = (event as CustomEvent<EmailInboxUpdatedDetail>).detail;
      if (!detail?.inboxId || detail.inboxId !== inboxId) return;
      refreshOpenThread();
    };
    const onWorkspaceEmailUpdated = () => {
      refreshOpenThread();
    };
    window.addEventListener(EMAIL_INBOX_UPDATED_EVENT, onInboxUpdated);
    window.addEventListener(
      WORKSPACE_EMAIL_UPDATED_EVENT,
      onWorkspaceEmailUpdated,
    );
    const timer = window.setInterval(refreshOpenThread, openThreadPollMs);
    return () => {
      window.removeEventListener(EMAIL_INBOX_UPDATED_EVENT, onInboxUpdated);
      window.removeEventListener(
        WORKSPACE_EMAIL_UPDATED_EVENT,
        onWorkspaceEmailUpdated,
      );
      window.clearInterval(timer);
    };
  }, [
    coerceOpenedMessageRead,
    inboxId,
    isCompose,
    messageId,
    openThreadPollMs,
    reloadMessageDetail,
  ]);

  // Opening a thread is a human read: clear AgentMail `unread` and the list badge.
  // (Previously we re-applied `unread` from labels on open, which put the orange
  // dot on opened rows and left unopened list rows without one.)
  useEffect(() => {
    if (!message || !inboxId || isCompose) return;
    if (suppressAutoMarkReadRef.current) return;
    const key = `${inboxId}\0${message.messageId}`;
    if (autoMarkedReadKeyRef.current === key) return;

    const unreadMessageIds = [
      message.messageId,
      ...(message.threadMessages ?? []).map((entry) => entry.messageId),
    ].filter((id, index, all) => {
      if (!id || all.indexOf(id) !== index) return false;
      if (id === message.messageId) {
        return isAgentMailMessageUnread(message.labels);
      }
      const row = message.threadMessages?.find(
        (entry) => entry.messageId === id,
      );
      return isAgentMailMessageUnread(row?.labels);
    });

    autoMarkedReadKeyRef.current = key;

    if (unreadMessageIds.length === 0) {
      dispatchEmailListPatch({
        inboxId,
        messageId: message.messageId,
        threadId: message.threadId ?? null,
        unread: false,
      });
      return;
    }

    const nextLabels = applyAgentMailReadStateLabels(message.labels, false);
    const nextThreadMessages = message.threadMessages?.map((entry) =>
      unreadMessageIds.includes(entry.messageId)
        ? {
            ...entry,
            labels: applyAgentMailReadStateLabels(entry.labels, false),
          }
        : entry,
    );
    const nextMessage: AgentMailMessageDetail = {
      ...message,
      labels: nextLabels,
      ...(nextThreadMessages ? { threadMessages: nextThreadMessages } : {}),
    };
    setMessage(nextMessage);
    writeEmailMessageDetailCache(inboxId, message.messageId, nextMessage);
    dispatchEmailListPatch({
      inboxId,
      messageId: message.messageId,
      threadId: message.threadId ?? null,
      unread: false,
    });

    void Promise.allSettled(
      unreadMessageIds.map((id) =>
        client.requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(id)}/mark-read`,
          { method: "POST" },
        ),
      ),
    ).then((results) => {
      const firstFailure = results.find(
        (result) => result.status === "rejected",
      );
      if (firstFailure && firstFailure.status === "rejected") {
        console.warn("[email] mark read failed:", firstFailure.reason);
      }
    });
  }, [client, inboxId, isCompose, message]);

  useEffect(() => {
    if (isCompose) return;
    if (!inboxId || (!messageId && !draftId)) {
      setMessage(null);
      setDraft(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const cachedMessage =
      messageId && !draftId
        ? peekEmailMessageDetailCache(inboxId, messageId)
        : null;
    const cachedDraft = draftId
      ? peekEmailDraftDetailCache(inboxId, draftId)
      : null;

    if (cachedMessage) {
      setMessage(cachedMessage);
      setDraft(null);
      setLoading(false);
    } else if (cachedDraft) {
      setDraft(cachedDraft);
      setMessage(null);
      setLoading(false);
    } else {
      // Drop the previous thread immediately so chrome (breadcrumb / tab title)
      // does not keep showing the last subject while the next detail loads.
      setMessage(null);
      setDraft(null);
      setLoading(true);
    }
    setError(null);

    // Warm cache → paint immediately and revalidate without deleting the LRU
    // entry. Force refetch stays on SSE / explicit reloadMessageDetail.
    const load = draftId
      ? fetchEmailDraftDetail(client, inboxId, draftId)
      : messageId
        ? fetchEmailMessageDetail(client, inboxId, messageId)
        : Promise.resolve(null);

    void load
      .then((body) => {
        if (cancelled) return;
        if (!body) {
          if (!cachedMessage && !cachedDraft) {
            setMessage(null);
            setDraft(null);
            setError("Could not load email.");
          }
          return;
        }
        if (draftId) {
          setDraft(body as AgentMailDraftDetail);
          setMessage(null);
        } else {
          setMessage(
            coerceOpenedMessageRead(body as AgentMailMessageDetail, inboxId),
          );
          setDraft(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, coerceOpenedMessageRead, draftId, inboxId, isCompose, messageId]);

  useEffect(() => {
    if (!message || isCompose) return;
    const resolvedInboxId = (inboxId || message.inboxId)?.trim();
    if (!resolvedInboxId) return;
    const rows =
      message.threadMessages && message.threadMessages.length > 0
        ? message.threadMessages
        : [
            {
              messageId: message.messageId,
              html: message.html,
              extractedHtml: message.extractedHtml,
              extractedText: message.extractedText,
              text: message.text,
              attachments: message.attachments,
            },
          ];
    for (const entry of rows) {
      const html = emailMessageHtmlBody(entry);
      if (!html) continue;
      const inlineAttachments = (entry.attachments ?? []).map((attachment) => ({
        attachmentId: attachment.attachmentId,
        contentId: attachment.contentId ?? null,
      }));
      for (const attachment of resolveEmailInlineAttachments(
        inlineAttachments,
        html,
      )) {
        prefetchInlineAttachmentBlob(
          client,
          resolvedInboxId,
          entry.messageId,
          attachment.attachmentId,
        );
      }
    }
  }, [client, inboxId, isCompose, message]);

  useEffect(() => {
    if (message && inboxId && messageId) {
      writeEmailMessageDetailCache(inboxId, messageId, message);
    }
  }, [inboxId, message, messageId]);

  useEffect(() => {
    if (draft && inboxId && draftId) {
      writeEmailDraftDetailCache(inboxId, draftId, draft);
    }
  }, [draft, draftId, inboxId]);

  return {
    message,
    setMessage,
    draft,
    setDraft,
    loading,
    error,
    reloadMessageDetail,
    suppressAutoMarkRead,
  };
}
