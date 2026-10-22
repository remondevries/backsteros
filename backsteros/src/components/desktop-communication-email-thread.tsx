import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InboxEmailListItem } from "@backsteros/ui";
import {
  EmailThreadMessageCard,
  buildEmailMessagePartyAutoLinks,
  emailMessageBody,
  emailMessageHtmlBody,
  getEmailMessageParty,
  parseReplyToAddress,
  resolveEmailMessagePartyAddress,
  resolveEmailThreadMetadataKey,
  type EmailMessagePartyMap,
} from "@backsteros/ui";

import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopApi } from "../lib/api-context";
import {
  fetchInlineAttachmentBlob,
  peekInlineAttachmentBlob,
} from "../lib/email-inline-attachment-cache.js";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useEmailMessageDetail } from "../screens/email/use-email-message-detail";

export type CommunicationEmailActiveParty = {
  messageId: string;
  address: string | null;
  contactId: string | null;
  organizationId: string | null;
};

type DesktopCommunicationEmailThreadProps = {
  item: InboxEmailListItem;
  selectedMessageId: string | null;
  onSelectMessage: (messageId: string) => void;
  onActivePartyChange?: (party: CommunicationEmailActiveParty | null) => void;
  onMessagePartiesChange?: (parties: EmailMessagePartyMap) => void;
  /** Parent-held map (manual links) merged over local/auto-link state. */
  messageParties?: EmailMessagePartyMap;
  /** Persist auto-discovered parties (merge). Returns updated map from server. */
  onAutoLinkParties?: (
    parties: EmailMessagePartyMap,
  ) => Promise<EmailMessagePartyMap | null | undefined>;
  /** Ensure linked contact has the party address labeled `other`. */
  onEnsureContactEmail?: (
    contactId: string,
    address: string,
  ) => Promise<void>;
};

/**
 * Compact AgentMail thread for Communication → Chat center pane — loads the
 * message detail and renders selectable cards so the left rail can link
 * org/contact per message.
 */
export function DesktopCommunicationEmailThread({
  item,
  selectedMessageId,
  onSelectMessage,
  onActivePartyChange,
  onMessagePartiesChange,
  messageParties: messagePartiesProp,
  onAutoLinkParties,
  onEnsureContactEmail,
}: DesktopCommunicationEmailThreadProps) {
  const { client } = useDesktopApi();
  const agentMail = useAgentMail();
  const workspace = useDesktopWorkspaceData();
  const draftId = item.draftId?.trim() || undefined;
  const { message, loading, error, setMessage } = useEmailMessageDetail({
    inboxId: item.inboxId,
    messageId: draftId ? undefined : item.messageId,
    draftId,
    isCompose: false,
  });

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );

  const fetchInlineAttachment = useCallback(
    (messageInboxId: string, messageRowId: string, attachmentId: string) =>
      fetchInlineAttachmentBlob(
        client,
        messageInboxId,
        messageRowId,
        attachmentId,
      ),
    [client],
  );

  const ourMailboxEmails = useMemo(() => {
    const emails = new Set<string>();
    const inboxEmail = message?.inboxEmail?.trim().toLowerCase();
    if (inboxEmail) emails.add(inboxEmail);
    for (const mailbox of agentMail.mailboxes) {
      const address = mailbox.email?.trim().toLowerCase();
      if (address) emails.add(address);
    }
    return emails;
  }, [agentMail.mailboxes, message?.inboxEmail]);

  const threadEntries = useMemo(() => {
    if (!message) return [];
    if (message.threadMessages && message.threadMessages.length > 0) {
      return [...message.threadMessages].sort((left, right) => {
        const leftAt = Date.parse(String(left.timestamp ?? ""));
        const rightAt = Date.parse(String(right.timestamp ?? ""));
        const leftMs = Number.isFinite(leftAt) ? leftAt : 0;
        const rightMs = Number.isFinite(rightAt) ? rightAt : 0;
        return rightMs - leftMs;
      });
    }
    return [
      {
        messageId: message.messageId,
        subject: message.subject,
        from: message.from,
        to: message.to ?? (message.inboxEmail ? [message.inboxEmail] : []),
        cc: message.cc ?? [],
        timestamp: message.timestamp,
        text: message.text,
        html: message.html,
        extractedHtml: message.extractedHtml,
        extractedText: message.extractedText,
        attachments: message.attachments,
      },
    ];
  }, [message]);

  const [localParties, setLocalParties] = useState<EmailMessagePartyMap>({});
  const autoLinkKeyRef = useRef<string | null>(null);
  const parties = useMemo(
    () => ({ ...localParties, ...(messagePartiesProp ?? {}) }),
    [localParties, messagePartiesProp],
  );

  // Hydrate from thread metadata without wiping newer parent/optimistic links.
  // Pushing `{}` (or a stale poll before the PATCH lands) was snapping the
  // left rail back to the previous soft-match / empty party.
  useEffect(() => {
    const fromMeta = message?.threadMetadata?.messageParties;
    if (!fromMeta || Object.keys(fromMeta).length === 0) return;
    setLocalParties((prev) => ({ ...fromMeta, ...prev }));
    onMessagePartiesChange?.(fromMeta);
  }, [
    message?.threadMetadata?.id,
    message?.threadMetadata?.updatedAt,
    message?.threadMetadata?.messageParties,
    onMessagePartiesChange,
  ]);

  useEffect(() => {
    if (!message || threadEntries.length === 0) return;
    const newestId = threadEntries[0]?.messageId?.trim();
    if (!newestId) return;
    if (
      selectedMessageId &&
      threadEntries.some((entry) => entry.messageId === selectedMessageId)
    ) {
      return;
    }
    onSelectMessage(newestId);
  }, [message?.messageId, onSelectMessage, selectedMessageId, threadEntries]);

  useEffect(() => {
    if (!message || !onAutoLinkParties) return;
    const threadKey = resolveEmailThreadMetadataKey({
      threadId: message.threadId,
      messageId: message.messageId,
      draftId: message.draftId,
    });
    const key = `${item.inboxId}:${threadKey}:${threadEntries
      .map((entry) => entry.messageId)
      .join(",")}`;
    if (autoLinkKeyRef.current === key) return;
    autoLinkKeyRef.current = key;

    const existing = {
      ...(message.threadMetadata?.messageParties ?? localParties),
    };
    // Migrate legacy thread-level party onto the opened message when the map is empty.
    if (
      Object.keys(existing).length === 0 &&
      (message.threadMetadata?.contactId ||
        message.threadMetadata?.organizationId)
    ) {
      const seedId = message.messageId.trim();
      if (seedId) {
        existing[seedId] = {
          contactId: message.threadMetadata?.contactId ?? null,
          organizationId: message.threadMetadata?.organizationId ?? null,
        };
      }
    }
    const discovered = buildEmailMessagePartyAutoLinks({
      messages: threadEntries,
      ourMailboxEmails,
      contacts: workspace.contacts,
      organizations: workspace.organizations,
      existing,
    });
    const seedOnly: EmailMessagePartyMap = {};
    if (
      message.threadMetadata?.contactId ||
      message.threadMetadata?.organizationId
    ) {
      const seedId = message.messageId.trim();
      const stored = message.threadMetadata?.messageParties?.[seedId];
      if (
        seedId &&
        !stored?.contactId &&
        !stored?.organizationId &&
        existing[seedId]
      ) {
        seedOnly[seedId] = existing[seedId]!;
      }
    }
    const toPersist = { ...seedOnly, ...discovered };
    if (Object.keys(toPersist).length === 0) return;

    void (async () => {
      const updated = await onAutoLinkParties(toPersist);
      const next = updated ?? { ...existing, ...toPersist };
      setLocalParties(next);
      onMessagePartiesChange?.(next);
      if (setMessage && message) {
        setMessage({
          ...message,
          threadMetadata: message.threadMetadata
            ? { ...message.threadMetadata, messageParties: next }
            : message.threadMetadata,
        });
      }
      for (const [messageId, party] of Object.entries(discovered)) {
        if (!party.contactId) continue;
        const entry = threadEntries.find((row) => row.messageId === messageId);
        if (!entry) continue;
        const fromEmail = parseReplyToAddress(entry.from ?? "")
          .trim()
          .toLowerCase();
        const isSent = Boolean(
          fromEmail && ourMailboxEmails.has(fromEmail),
        );
        const address = resolveEmailMessagePartyAddress({
          from: entry.from,
          to: entry.to,
          isSent,
          ourMailboxEmails,
        });
        if (address) {
          await onEnsureContactEmail?.(party.contactId, address);
        }
      }
    })();
  }, [
    item.inboxId,
    message,
    onAutoLinkParties,
    onEnsureContactEmail,
    onMessagePartiesChange,
    ourMailboxEmails,
    setMessage,
    threadEntries,
    workspace.contacts,
    workspace.organizations,
  ]);

  useEffect(() => {
    if (!onActivePartyChange) return;
    const messageId = selectedMessageId?.trim();
    if (!messageId) {
      onActivePartyChange(null);
      return;
    }
    const entry = threadEntries.find((row) => row.messageId === messageId);
    if (!entry) {
      onActivePartyChange(null);
      return;
    }
    const fromEmail = parseReplyToAddress(entry.from ?? "")
      .trim()
      .toLowerCase();
    const isSent = Boolean(fromEmail && ourMailboxEmails.has(fromEmail));
    const address = resolveEmailMessagePartyAddress({
      from: entry.from,
      to: entry.to,
      isSent,
      ourMailboxEmails,
    });
    const party = getEmailMessageParty(parties, messageId);
    onActivePartyChange({
      messageId,
      address,
      contactId: party?.contactId ?? null,
      organizationId: party?.organizationId ?? null,
    });
  }, [
    onActivePartyChange,
    ourMailboxEmails,
    parties,
    selectedMessageId,
    threadEntries,
  ]);

  if (loading && !message) {
    return (
      <div className="communication-chat__empty">Loading email thread…</div>
    );
  }

  if (error && !message) {
    return (
      <div className="communication-chat__empty">
        {error || "Could not load this email."}
      </div>
    );
  }

  if (!message) {
    return (
      <div className="communication-chat__empty">
        Select an email to read the thread.
      </div>
    );
  }

  return (
    <div className="communication-chat__thread-body communication-chat__email-thread">
      <div className="communication-chat__thread-container">
        <div className="communication-chat__messages-wrap">
          <div className="communication-chat__messages communication-chat__email-messages">
            {threadEntries.map((entry) => {
              const fromEmail = parseReplyToAddress(entry.from ?? "")
                .trim()
                .toLowerCase();
              const isSent = Boolean(
                fromEmail && ourMailboxEmails.has(fromEmail),
              );
              const toList = entry.to ?? [];
              const party = getEmailMessageParty(parties, entry.messageId);
              const partyAddress = resolveEmailMessagePartyAddress({
                from: entry.from,
                to: toList,
                isSent,
                ourMailboxEmails,
              });
              let avatarSrc: string | null = null;
              if (isSent) {
                const mailbox = agentMail.mailboxes.find(
                  (entry) =>
                    entry.email?.trim().toLowerCase() === fromEmail ||
                    entry.email?.trim().toLowerCase() ===
                      message.inboxEmail?.trim().toLowerCase(),
                );
                const mailboxContactId = mailbox?.contactId?.trim();
                if (mailboxContactId) {
                  avatarSrc =
                    contactAvatarSrc[mailboxContactId] ??
                    workspace.contacts.find(
                      (contact) => contact.id === mailboxContactId,
                    )?.avatarSrc ??
                    null;
                }
                avatarSrc = avatarSrc || mailbox?.avatarSrc?.trim() || null;
              } else if (party?.contactId) {
                avatarSrc =
                  contactAvatarSrc[party.contactId] ??
                  workspace.contacts.find(
                    (contact) => contact.id === party.contactId,
                  )?.avatarSrc ??
                  null;
              } else if (partyAddress) {
                const matched = workspace.contacts.find((contact) => {
                  const primary = contact.email?.trim().toLowerCase();
                  if (
                    primary &&
                    primary === partyAddress.trim().toLowerCase()
                  ) {
                    return true;
                  }
                  return (contact.emails ?? []).some(
                    (row) =>
                      row.address?.trim().toLowerCase() ===
                      partyAddress.trim().toLowerCase(),
                  );
                });
                if (matched) {
                  avatarSrc =
                    contactAvatarSrc[matched.id] ?? matched.avatarSrc ?? null;
                }
              }

              return (
                <EmailThreadMessageCard
                  key={entry.messageId}
                  messageId={entry.messageId}
                  subject={entry.subject?.trim() || "(no subject)"}
                  from={entry.from}
                  to={toList}
                  timestamp={entry.timestamp ?? Date.now()}
                  body={emailMessageBody(entry)}
                  bodyHtml={emailMessageHtmlBody(entry)}
                  inlineAttachments={(entry.attachments ?? []).map(
                    (attachment) => ({
                      attachmentId: attachment.attachmentId,
                      contentId: attachment.contentId ?? null,
                    }),
                  )}
                  attachments={(entry.attachments ?? []).map((attachment) => ({
                    attachmentId: attachment.attachmentId,
                    filename: attachment.filename ?? null,
                    size: attachment.size ?? null,
                    contentType: attachment.contentType ?? null,
                    contentDisposition: attachment.contentDisposition ?? null,
                    contentId: attachment.contentId ?? null,
                  }))}
                  fetchInlineAttachment={fetchInlineAttachment}
                  peekInlineAttachment={peekInlineAttachmentBlob}
                  inlineAttachmentInboxId={item.inboxId}
                  inlineAttachmentMessageId={entry.messageId}
                  bodyViewMode="rendered"
                  isSent={isSent}
                  selected={entry.messageId === selectedMessageId}
                  onSelect={() => onSelectMessage(entry.messageId)}
                  partyAvatar={{
                    direction: isSent ? "sent" : "received",
                    src: avatarSrc,
                    label:
                      (isSent
                        ? message.inboxEmail?.trim()
                        : entry.from?.trim()) ||
                      (isSent ? "Sent" : "Received"),
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
