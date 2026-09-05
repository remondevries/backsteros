import { Fragment, useCallback, useMemo } from "react";
import type { AgentMailMessageDetail } from "@backsteros/contracts";
import {
  contactMatchesEmailAddress,
  getContactEmailAddresses,
  resolveContactEmailForAddress,
} from "@backsteros/contracts";
import {
  EmailDraftActions,
  EmailComposeChrome,
  EmailThreadMessageCard,
  EmailThreadCommentBubble,
  EmailThreadCommentComposer,
  EmailThreadMinimap,
  TaskMentionBlockChip,
  EmailPropertiesDisplay,
  EMAIL_PROPERTIES_PANEL_WIDTH_KEY,
  ResizableSidePanel,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  migrateLegacyTaskStatus,
  emailMailboxFromDisplay,
  parseReplyToAddress,
  replySubject as formatReplySubject,
  useMentionCatalogOptional,
  SegmentedPillToggle,
  emailMessageBody,
  emailMessageHtmlBody,
  type EmailMailbox,
} from "@backsteros/ui";

import {
  formatEmailAgentTaskCardComment,
  parseEmailAgentTaskCard,
} from "../../lib/email-task-card";
import { useDesktopApi } from "../../lib/api-context";
import { useAgentMail } from "../../lib/agentmail-context";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../../lib/avatar-src";
import {
  fetchInlineAttachmentBlob,
  peekInlineAttachmentBlob,
} from "../../lib/email-inline-attachment-cache.js";
import { dispatchEmailListPatch } from "../../lib/use-agentmail-mailboxes";
import { useDesktopWorkspaceData } from "../../lib/workspace-data";

import { resolveAgentTaskMentionChip } from "./email-page-helpers";
import type { useEmailDraftActions } from "./use-email-draft-actions";
import type { useEmailMessageActions } from "./use-email-message-actions";
import type { useEmailThreadComments } from "./use-email-thread-comments";
import type { useEmailThreadMetadata } from "./use-email-thread-metadata";
import type { useEmailThreadView } from "./use-email-thread-view";

type EmailThreadDetailProps = {
  inboxId: string | undefined;
  messageId: string | undefined;
  message: AgentMailMessageDetail;
  composeMailboxes: (EmailMailbox & { avatarSrc: string | null })[];
  contactAvatarSrc: Record<string, string>;
  mailboxSignOffAvatarSrc: (
    mailboxInboxId: string | null | undefined,
  ) => string | null;
  conceptDraftActionsDisabled: boolean;
  showDraftWorking: boolean;
  metadataState: ReturnType<typeof useEmailThreadMetadata>;
  drafts: ReturnType<typeof useEmailDraftActions>;
  comments: ReturnType<typeof useEmailThreadComments>;
  actions: ReturnType<typeof useEmailMessageActions>;
  view: ReturnType<typeof useEmailThreadView>;
};

export function EmailThreadDetail({
  inboxId,
  messageId,
  message,
  composeMailboxes,
  contactAvatarSrc,
  mailboxSignOffAvatarSrc,
  conceptDraftActionsDisabled,
  showDraftWorking,
  metadataState,
  drafts,
  comments,
  actions,
  view,
}: EmailThreadDetailProps) {
  const { client } = useDesktopApi();
  const agentMail = useAgentMail();
  const workspace = useDesktopWorkspaceData();
  const { organizations, contacts, projects } = workspace;
  const mentionCatalog = useMentionCatalogOptional()?.catalog;
  const {
    statusOverride,
    setStatusOverride,
    priorityOverride,
    setPriorityOverride,
    dueDateOverride,
    setDueDateOverride,
    organizationId,
    setOrganizationId,
    contactId,
    assigneeId,
    setAssigneeId,
    projectKey,
    setProjectKey,
    patchThreadMetadata,
    handleContactChange,
  } = metadataState;
  const {
    conceptError,
    sendError,
    sending,
    deleting,
    conceptSaving,
    conceptBodySaving,
    conceptBodyDraft,
    setConceptBodyDraft,
    conceptBodyMode,
    handleConceptBodyModeChange,
    draftStageWorking,
    replyComposeOpen,
    setReplyComposeOpen,
    replyInboxId,
    setReplyInboxId,
    replyTo,
    setReplyTo,
    replySubjectText,
    setReplySubjectText,
    sendDraft,
    deleteDraft,
  } = drafts;
  const {
    threadComments,
    commentSending,
    savingCommentId,
    selectedCommentId,
    setSelectedCommentId,
    deleteThreadComment,
    updateThreadComment,
    commentAgentWorking,
    draftAgentWorking,
    handleSubmitThreadComment,
  } = comments;
  const {
    loadMessageSource,
    startForward,
    markMessagesUnread,
    handleReportSpamMessage,
    handleDeleteThreadMessage,
  } = actions;
  const {
    threadBodyViewMode,
    handleThreadBodyViewModeChange,
    workingEnter,
    freshCommentIds,
    propertiesRailWidth,
    propertiesRailRef,
    threadScrollShellRef,
    threadScrollportRef,
    emailMinimapItems,
    minimapHasPersistentGutter,
    minimapHitStripWidth,
    minimapInViewIds,
    jumpToEmailMinimapItem,
  } = view;

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
  const peekInlineAttachment = useCallback(
    (messageInboxId: string, messageRowId: string, attachmentId: string) =>
      peekInlineAttachmentBlob(messageInboxId, messageRowId, attachmentId),
    [],
  );

  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withAvatarSrc(organizations, organizationAvatarSrc),
      ),
    [organizationAvatarSrc, organizations],
  );

  const contactOptions = useMemo(
    () =>
      buildContactDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
      ),
    [projects],
  );

  const threadMessages =
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
  const ourMailboxEmails = new Set(
    [
      message.inboxEmail,
      ...agentMail.mailboxes.map((mailbox) => mailbox.email),
    ]
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const status = (
    <>
      {conceptError ? (
        <p className="email-concept-error" role="alert">
          {conceptError}
        </p>
      ) : null}
      {sendError ? (
        <p className="email-send-error" role="alert">
          {sendError}
        </p>
      ) : null}
    </>
  );
  const conceptDraftId =
    message.conceptDraft?.draftId?.trim() || message.conceptDraftId?.trim();
  const draftInboxId = message.conceptDraft?.inboxId?.trim() || inboxId || "";
  const replyActive =
    replyComposeOpen || Boolean(message.conceptDraft);
  const resolvedReplyInboxId =
    replyInboxId || draftInboxId || inboxId || composeMailboxes[0]?.inboxId || "";
  const resolvedReplyTo =
    replyTo || parseReplyToAddress(message.from);
  const resolvedReplySubject =
    replySubjectText || formatReplySubject(message.subject);
  const linkedContactForFrom = contactId
    ? contacts.find((entry) => entry.id === contactId) ?? null
    : null;
  const linkedAssigneeForComments = assigneeId
    ? contacts.find((entry) => entry.id === assigneeId) ?? null
    : null;
  const assigneeCommentName =
    linkedAssigneeForComments?.name?.trim() ||
    message.threadMetadata?.assigneeName?.trim() ||
    null;
  const assigneeCommentAvatarSrc = assigneeId
    ? contactAvatarSrc[assigneeId] ?? null
    : null;
  const threadContactPicker = {
    contactId,
    contactName:
      linkedContactForFrom?.name?.trim() ||
      message.threadMetadata?.contactName?.trim() ||
      null,
    contactEmail:
      resolveContactEmailForAddress(
        linkedContactForFrom,
        typeof message.from === "string" ? message.from : null,
      ) ??
      linkedContactForFrom?.email?.trim() ??
      null,
    contactAvatarSrc: contactId
      ? contactAvatarSrc[contactId] ?? null
      : null,
    options: contactOptions,
    onContactChange: handleContactChange,
    onCreateContactFromQuery: (query: string) => {
      void workspace
        .createContact({
          name: query,
          organizationId: organizationId ?? undefined,
        })
        .then((created) => {
          handleContactChange(created.id);
        });
    },
  };
  const mailboxChipForEmail = (email: string | null | undefined) => {
    const normalized = email?.trim().toLowerCase() || null;
    if (!normalized) return null;
    const mailbox =
      composeMailboxes.find(
        (entry) => entry.email.trim().toLowerCase() === normalized,
      ) ?? null;
    if (!mailbox) return null;
    return {
      name: emailMailboxFromDisplay(mailbox),
      avatarSrc: mailbox.avatarSrc ?? null,
    };
  };
  const mailboxChipForInbox = (mailboxInboxId: string | null | undefined) => {
    const mailbox =
      composeMailboxes.find((entry) => entry.inboxId === mailboxInboxId) ??
      null;
    if (!mailbox) return null;
    return {
      name: emailMailboxFromDisplay(mailbox),
      avatarSrc: mailbox.avatarSrc ?? null,
    };
  };
  const replyDraftActions = (
    <EmailDraftActions
      modeOnly={!conceptDraftId}
      onSend={
        conceptDraftId
          ? () => {
              void sendDraft(draftInboxId, conceptDraftId, messageId);
            }
          : undefined
      }
      onDelete={
        conceptDraftId
          ? () => {
              void deleteDraft(draftInboxId, conceptDraftId, messageId);
            }
          : undefined
      }
      sending={sending}
      deleting={deleting}
      disabled={conceptDraftActionsDisabled}
      bodyMode={conceptBodyMode}
      onBodyModeChange={(mode) => {
        void handleConceptBodyModeChange(mode);
      }}
      savingBody={conceptBodySaving}
    />
  );
  const replyChrome = replyActive ? (
    <EmailComposeChrome
      variant="reply"
      mailboxes={composeMailboxes}
      inboxId={resolvedReplyInboxId}
      onInboxIdChange={setReplyInboxId}
      to={resolvedReplyTo}
      onToChange={setReplyTo}
      subject={resolvedReplySubject}
      onSubjectChange={setReplySubjectText}
      body={conceptBodyDraft}
      bodyMode={conceptBodyMode}
      onBodyChange={setConceptBodyDraft}
      replyGreeting={message.conceptDraft?.greeting}
      replySignOff={message.conceptDraft?.signOff}
      replySignOffAvatarSrc={mailboxSignOffAvatarSrc(resolvedReplyInboxId)}
      toContact={{
        ...threadContactPicker,
        onContactChange: (next) => {
          handleContactChange(next);
          if (!next) return;
          const selected =
            contacts.find((entry) => entry.id === next) ?? null;
          const email =
            getContactEmailAddresses(selected ?? {})[0]?.trim() || null;
          if (email) setReplyTo(email);
        },
      }}
      fieldsDisabled={
        conceptSaving ||
        conceptBodySaving ||
        draftAgentWorking ||
        draftStageWorking
      }
      agentWorking={showDraftWorking}
      actions={replyDraftActions}
    />
  ) : null;
  const replyTimestampMs = (() => {
    // Pin the open reply draft to the end of a chronological timeline so it
    // sits just above the composer (chat-style latest-at-bottom).
    if (replyActive) return Number.MAX_SAFE_INTEGER;
    const raw = message.conceptDraft?.updatedAt;
    if (raw) {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  })();
  const timelineItems = [
    ...threadMessages.map((entry) => {
      const parsed = Date.parse(entry.timestamp);
      const fromEmail = parseReplyToAddress(entry.from).toLowerCase();
      const linkedContactEmail =
        resolveContactEmailForAddress(linkedContactForFrom, entry.from) ??
        getContactEmailAddresses(linkedContactForFrom ?? {})[0] ??
        null;
      const linkedContactEmailNormalized =
        linkedContactEmail?.trim().toLowerCase() || null;
      const isFromOurMailbox = Boolean(
        fromEmail && ourMailboxEmails.has(fromEmail),
      );
      const rawToList = entry.to.map((address) => address.trim()).filter(Boolean);
      // Prefer real To recipients; if AgentMail omits them on outbound, use the
      // linked contact email — never fall back to our own inbox on outbound To.
      const toList =
        rawToList.length > 0
          ? rawToList
          : isFromOurMailbox && linkedContactEmail
            ? [linkedContactEmail]
            : !isFromOurMailbox && message.inboxEmail
              ? [message.inboxEmail]
              : [];
      const toEmails = toList.map((address) =>
        parseReplyToAddress(address).toLowerCase(),
      );
      // Always put the thread-contact picker on the other-party side:
      // From for inbound, To for our outbound (and when the contact email is there).
      const contactField: "from" | "to" = (() => {
        if (
          linkedContactForFrom &&
          contactMatchesEmailAddress(linkedContactForFrom, entry.from)
        ) {
          return "from";
        }
        if (
          linkedContactForFrom &&
          toList.some((address) =>
            contactMatchesEmailAddress(linkedContactForFrom, address),
          )
        ) {
          return "to";
        }
        if (linkedContactEmailNormalized && fromEmail === linkedContactEmailNormalized) {
          return "from";
        }
        if (
          linkedContactEmailNormalized &&
          toEmails.includes(linkedContactEmailNormalized)
        ) {
          return "to";
        }
        if (isFromOurMailbox) {
          return "to";
        }
        return "from";
      })();
      const ourToEmail =
        toEmails.find((email) => ourMailboxEmails.has(email)) ?? null;
      const fromMailboxChip =
        contactField === "to"
          ? mailboxChipForEmail(fromEmail) ??
            mailboxChipForInbox(inboxId || message.inboxId)
          : null;
      const toMailboxChip =
        contactField === "from"
          ? mailboxChipForEmail(ourToEmail) ??
            mailboxChipForInbox(inboxId || message.inboxId)
          : null;
      const sentMailbox =
        fromMailboxChip ??
        (isFromOurMailbox
          ? mailboxChipForInbox(inboxId || message.inboxId)
          : null);
      const partyAvatar = isFromOurMailbox
        ? {
            direction: "sent" as const,
            src: sentMailbox?.avatarSrc ?? null,
            label: sentMailbox?.name?.trim() || fromEmail || "Sent",
          }
        : {
            direction: "received" as const,
            src: threadContactPicker.contactAvatarSrc,
            label:
              threadContactPicker.contactName?.trim() ||
              entry.from.trim() ||
              "Received",
          };
      return {
        key: `email:${entry.messageId}`,
        at: Number.isFinite(parsed) ? parsed : 0,
        node: (
          <EmailThreadMessageCard
            messageId={entry.messageId}
            subject={entry.subject.trim() || "(no subject)"}
            from={entry.from}
            to={toList}
            timestamp={entry.timestamp}
            body={emailMessageBody(entry)}
            bodyHtml={emailMessageHtmlBody(entry)}
            inlineAttachments={(entry.attachments ?? []).map((attachment) => ({
              attachmentId: attachment.attachmentId,
              contentId: attachment.contentId ?? null,
            }))}
            attachments={(entry.attachments ?? []).map((attachment) => ({
              attachmentId: attachment.attachmentId,
              filename: attachment.filename ?? null,
              size: attachment.size ?? null,
              contentType: attachment.contentType ?? null,
              contentDisposition: attachment.contentDisposition ?? null,
              contentId: attachment.contentId ?? null,
            }))}
            fetchInlineAttachment={fetchInlineAttachment}
            peekInlineAttachment={peekInlineAttachment}
            inlineAttachmentInboxId={inboxId || message.inboxId}
            inlineAttachmentMessageId={entry.messageId}
            bodyViewMode={threadBodyViewMode}
            loadSource={() =>
              loadMessageSource(inboxId || message.inboxId, entry.messageId)
            }
            isSent={isFromOurMailbox}
            partyAvatar={partyAvatar}
            fromContact={
              contactField === "from" ? threadContactPicker : null
            }
            toContact={contactField === "to" ? threadContactPicker : null}
            fromMailbox={fromMailboxChip}
            toMailbox={toMailboxChip}
            onReply={() => setReplyComposeOpen(true)}
            onReplyAll={() => setReplyComposeOpen(true)}
            onForward={() =>
              startForward({
                subject: entry.subject,
                from: entry.from,
                to: toList,
                timestamp: entry.timestamp,
                body: emailMessageBody(entry),
              })
            }
            onMarkUnreadFromHere={() => {
              const entryAt = Date.parse(entry.timestamp);
              const ids = threadMessages
                .filter((row) => {
                  if (row.messageId === entry.messageId) return true;
                  const rowAt = Date.parse(row.timestamp);
                  return (
                    Number.isFinite(entryAt) &&
                    Number.isFinite(rowAt) &&
                    rowAt >= entryAt
                  );
                })
                .map((row) => row.messageId);
              markMessagesUnread(ids);
            }}
            onReportSpam={() => handleReportSpamMessage(entry.messageId)}
            deleteEntityLabel={`email from ${parseReplyToAddress(entry.from) || "sender"}`}
            onDelete={() => handleDeleteThreadMessage(entry.messageId)}
          />
        ),
      };
    }),
    ...threadComments.flatMap((comment) => {
      const parsed = Date.parse(comment.createdAt);
      const at = Number.isFinite(parsed) ? parsed : 0;
      const taskCard = parseEmailAgentTaskCard(comment.body);
      const bubbleProps = {
        author: comment.author,
        timestamp: comment.createdAt,
        authorName:
          comment.author === "agent" ? assigneeCommentName : null,
        authorAvatarSrc:
          comment.author === "agent" ? assigneeCommentAvatarSrc : null,
        entering: freshCommentIds.has(comment.id),
        selected: selectedCommentId === comment.id,
        onSelect: () => {
          setSelectedCommentId((current) =>
            current === comment.id ? null : comment.id,
          );
        },
        onDelete: () => {
          void deleteThreadComment(comment.id);
        },
        saving: savingCommentId === comment.id,
      } as const;

      if (taskCard) {
        const chip = resolveAgentTaskMentionChip(
          taskCard.card,
          mentionCatalog?.tasks ?? [],
        );
        const note = taskCard.note.trim();
        return [
          {
            key: `comment-task:${comment.id}`,
            at,
            node: (
              <div className="email-thread-agent-task">
                {note ? (
                  <EmailThreadCommentBubble
                    {...bubbleProps}
                    body={note}
                    onSaveEdit={(nextBody) =>
                      updateThreadComment(
                        comment.id,
                        formatEmailAgentTaskCardComment(
                          taskCard.card,
                          nextBody,
                        ),
                      )
                    }
                  />
                ) : null}
                <div className="mention-task-block">
                  <TaskMentionBlockChip
                    task={chip.task}
                    href={chip.href}
                  />
                </div>
              </div>
            ),
          },
        ];
      }

      return [
        {
          key: `comment:${comment.id}`,
          at,
          node: (
            <EmailThreadCommentBubble
              {...bubbleProps}
              body={comment.body}
              onSaveEdit={(nextBody) =>
                updateThreadComment(comment.id, nextBody)
              }
            />
          ),
        },
      ];
    }),
    ...(replyChrome
      ? [
          {
            key: `reply:${conceptDraftId ?? "draft"}`,
            at: replyTimestampMs,
            node: replyChrome,
          },
        ]
      : []),
  ].sort((a, b) => a.at - b.at);
  const threadTimeline = (
    <div className="email-thread">
      {status}
      {timelineItems.map((item) => (
        <Fragment key={item.key}>{item.node}</Fragment>
      ))}
      {commentAgentWorking ? (
        <div
          className={`email-thread-working-row${
            workingEnter ? " email-thread-working-row--enter" : ""
          }`}
          role="status"
        >
          <span className="email-thread-working-dots" aria-hidden>
            <span className="email-thread-working-dot" />
            <span className="email-thread-working-dot" />
            <span className="email-thread-working-dot" />
          </span>
          <span className="email-thread-working-copy">Working…</span>
        </div>
      ) : null}
    </div>
  );
  const metadata = message.threadMetadata;
  const linkedOrganization = organizationId
    ? organizations.find((entry) => entry.id === organizationId) ?? null
    : null;
  const linkedContact = contactId
    ? contacts.find((entry) => entry.id === contactId) ?? null
    : null;
  const linkedAssignee = assigneeId
    ? contacts.find((entry) => entry.id === assigneeId) ?? null
    : null;
  const linkedProject = projectKey
    ? projects.find((entry) => entry.key === projectKey) ?? null
    : null;
  return (
    <div
      className="email-detail-split"
      data-content-detail
      data-detail-split=""
    >
      <div className="email-detail-scroll-shell" ref={threadScrollShellRef}>
        <EmailThreadMinimap
          items={emailMinimapItems}
          hasPersistentGutter={minimapHasPersistentGutter}
          hitStripWidth={minimapHitStripWidth}
          inViewIds={minimapInViewIds}
          onSelect={jumpToEmailMinimapItem}
        />
        <div
          ref={threadScrollportRef}
          className="email-detail-scrollport email-detail-scrollport--fade"
        >
          <div className="email-detail-scroll-row">
            <div className="email-detail-main">{threadTimeline}</div>
            <ResizableSidePanel
              storageKey={EMAIL_PROPERTIES_PANEL_WIDTH_KEY}
              className="detail-properties-panel email-detail-properties-rail"
              edge="start"
              panelRef={propertiesRailRef}
            >
              <div className="detail-properties-panel__inner">
                <div className="email-detail-view-toggle">
                  <SegmentedPillToggle
                    value={threadBodyViewMode}
                    options={[
                      { value: "plain", label: "Plain text" },
                      { value: "rendered", label: "Rendered" },
                      { value: "source", label: "Source" },
                    ]}
                    onChange={handleThreadBodyViewModeChange}
                    ariaLabel="Email body view mode"
                  />
                </div>
                <EmailPropertiesDisplay
                  thread={{
                    organizationId,
                    organizationName:
                      linkedOrganization?.name ??
                      metadata?.organizationName ??
                      null,
                    contactId,
                    contactName:
                      linkedContact?.name ?? metadata?.contactName ?? null,
                    contactAvatarSrc: contactId
                      ? contactAvatarSrc[contactId] ?? null
                      : null,
                    assigneeId,
                    assigneeName:
                      linkedAssignee?.name ?? metadata?.assigneeName ?? null,
                    projectKey: linkedProject?.key ?? projectKey,
                    projectName:
                      linkedProject?.name ?? metadata?.projectName ?? null,
                    status:
                      statusOverride ??
                      migrateLegacyTaskStatus(metadata?.status ?? "triage"),
                    priority: priorityOverride ?? metadata?.priority ?? 0,
                    dueDate:
                      dueDateOverride !== undefined
                        ? dueDateOverride
                        : metadata?.dueDate
                          ? new Date(metadata.dueDate)
                          : null,
                  }}
                  organizationOptions={organizationOptions}
                  contactOptions={contactOptions}
                  assigneeOptions={assigneeOptions}
                  projectOptions={projectOptions}
                  organizationNavigateHref={
                    organizationId ? `/organizations/${organizationId}` : null
                  }
                  contactNavigateHref={
                    contactId ? `/contacts/${contactId}` : null
                  }
                  assigneeNavigateHref={
                    assigneeId ? `/contacts/${assigneeId}` : null
                  }
                  projectNavigateHref={
                    projectKey ? `/projects/${projectKey}` : null
                  }
                  onStatusChange={(next) => {
                    setStatusOverride(next);
                    if (inboxId && message) {
                      dispatchEmailListPatch({
                        inboxId,
                        messageId: message.messageId,
                        threadId: message.threadId ?? null,
                        status: next,
                      });
                    }
                    void patchThreadMetadata({ status: next });
                  }}
                  onPriorityChange={(next) => {
                    setPriorityOverride(next);
                    if (inboxId && message) {
                      dispatchEmailListPatch({
                        inboxId,
                        messageId: message.messageId,
                        threadId: message.threadId ?? null,
                        priority: next,
                      });
                    }
                    void patchThreadMetadata({ priority: next });
                  }}
                  onDueDateChange={(next) => {
                    setDueDateOverride(next);
                    if (inboxId && message) {
                      dispatchEmailListPatch({
                        inboxId,
                        messageId: message.messageId,
                        threadId: message.threadId ?? null,
                        dueDate: next ? next.toISOString() : null,
                      });
                    }
                    void patchThreadMetadata({
                      dueDate: next ? next.toISOString() : null,
                    });
                  }}
                  onOrganizationChange={(next) => {
                    setOrganizationId(next);
                    const organization = next
                      ? organizations.find((entry) => entry.id === next) ??
                        null
                      : null;
                    if (inboxId && message) {
                      dispatchEmailListPatch({
                        inboxId,
                        messageId: message.messageId,
                        threadId: message.threadId ?? null,
                        organizationId: next,
                        organizationName: organization?.name ?? null,
                      });
                    }
                    void patchThreadMetadata({ organizationId: next });
                  }}
                  onContactChange={handleContactChange}
                  onAssigneeChange={(next) => {
                    setAssigneeId(next);
                    const assignee = next
                      ? contacts.find((entry) => entry.id === next) ?? null
                      : null;
                    if (inboxId && message) {
                      dispatchEmailListPatch({
                        inboxId,
                        messageId: message.messageId,
                        threadId: message.threadId ?? null,
                        assigneeId: next,
                        assigneeName: assignee?.name ?? null,
                      });
                    }
                    void patchThreadMetadata({ assigneeId: next });
                  }}
                  onProjectChange={(nextKey) => {
                    setProjectKey(nextKey);
                    const project = nextKey
                      ? projects.find((entry) => entry.key === nextKey) ??
                        null
                      : null;
                    if (inboxId && message) {
                      dispatchEmailListPatch({
                        inboxId,
                        messageId: message.messageId,
                        threadId: message.threadId ?? null,
                        projectId: project?.id ?? null,
                        projectName: project?.name ?? null,
                        projectKey: project?.key ?? null,
                      });
                    }
                    void patchThreadMetadata({
                      projectId: project?.id ?? null,
                    });
                  }}
                  onCreateOrganizationFromQuery={(query) => {
                    void workspace
                      .createOrganization({ name: query })
                      .then((created) => {
                        setOrganizationId(created.id);
                        if (inboxId && message) {
                          dispatchEmailListPatch({
                            inboxId,
                            messageId: message.messageId,
                            threadId: message.threadId ?? null,
                            organizationId: created.id,
                            organizationName: query.trim() || null,
                          });
                        }
                        void patchThreadMetadata({
                          organizationId: created.id,
                        });
                      });
                  }}
                  onCreateContactFromQuery={(query) => {
                    void workspace
                      .createContact({
                        name: query,
                        organizationId: organizationId ?? undefined,
                      })
                      .then((created) => {
                        handleContactChange(created.id);
                      });
                  }}
                  onCreateAssigneeFromQuery={(query) => {
                    void workspace
                      .createContact({
                        name: query,
                        organizationId: organizationId ?? undefined,
                      })
                      .then((created) => {
                        setAssigneeId(created.id);
                        void patchThreadMetadata({ assigneeId: created.id });
                      });
                  }}
                />
              </div>
            </ResizableSidePanel>
          </div>
        </div>
        <div className="email-thread-composer-dock">
          <div className="email-thread-composer-dock__main">
            <div className="email-thread-composer-dock__inner">
              <EmailThreadCommentComposer
                onSubmit={handleSubmitThreadComment}
                disabled={conceptSaving || conceptBodySaving}
                sending={commentSending || commentAgentWorking}
                contextLabel={
                  conceptBodyMode === "edit" &&
                  Boolean(
                    message.conceptDraft ||
                      message.conceptDraftId ||
                      replyComposeOpen,
                  )
                    ? "Concept draft"
                    : null
                }
                placeholder={
                  conceptBodyMode === "edit" &&
                  Boolean(
                    message.conceptDraft ||
                      message.conceptDraftId ||
                      replyComposeOpen,
                  )
                    ? "Ask AI to update this draft…"
                    : "Message the agent about this email…"
                }
              />
            </div>
          </div>
          <div
            className="email-thread-composer-dock__rail-spacer"
            style={{ width: propertiesRailWidth, flex: `0 0 ${propertiesRailWidth}px` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
