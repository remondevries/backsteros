import { useCallback, useEffect, useState } from "react";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
} from "@backsteros/contracts";
import {
  emailMessageHtmlBody,
  resolveEmailInlineAttachments,
} from "@backsteros/ui";

import { useDesktopApi } from "../../lib/api-context";
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
  EMAIL_INBOX_UPDATED_EVENT,
  type EmailInboxUpdatedDetail,
} from "../../lib/use-agentmail-mailboxes";

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
          setMessage(reloaded);
        })
        .catch(() => {});
    };
    const onInboxUpdated = (event: Event) => {
      const detail = (event as CustomEvent<EmailInboxUpdatedDetail>).detail;
      if (!detail?.inboxId || detail.inboxId !== inboxId) return;
      refreshOpenThread();
    };
    window.addEventListener(EMAIL_INBOX_UPDATED_EVENT, onInboxUpdated);
    const timer = window.setInterval(refreshOpenThread, 15_000);
    return () => {
      window.removeEventListener(EMAIL_INBOX_UPDATED_EVENT, onInboxUpdated);
      window.clearInterval(timer);
    };
  }, [inboxId, isCompose, messageId, reloadMessageDetail]);

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
      setLoading(true);
    }
    setError(null);

    const load = draftId
      ? fetchEmailDraftDetail(client, inboxId, draftId)
      : messageId
        ? fetchEmailMessageDetail(
            client,
            inboxId,
            messageId,
            cachedMessage ? { force: true } : undefined,
          )
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
          setMessage(body as AgentMailMessageDetail);
          setDraft(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, draftId, inboxId, isCompose, messageId]);

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
  };
}
