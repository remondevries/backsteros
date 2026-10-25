import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TaskLink } from "@backsteros/contracts";
import {
  filterProjectsForDefaultPicker,
  resolveContactEmailForAddress,
} from "@backsteros/contracts";
import type {
  CommunicationEmailActiveParty,
  InboxEmailListItem,
} from "@backsteros/ui";
import {
  COMPOSE_NO_PROJECT_VALUE,
  DefaultProjectIcon,
  EmailAgentActionCards,
  EmailComposeChrome,
  EmailDraftActions,
  EmailThreadCommentBubble,
  EmailThreadCommentComposer,
  EmailThreadMessageCard,
  MeetingMentionBlockChip,
  ProjectStatusIcon,
  RegisterEntityDeleteAction,
  RegisterEntityMenuItems,
  TaskMentionBlockChip,
  buildContactDropdownOptions,
  buildEmailMessagePartyAutoLinks,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildReplyRecipients,
  emailMessageBody,
  emailMessageHtmlBody,
  formatMeetingDisplayId,
  getCalendarMeetingHref,
  getEmailItemHref,
  getEmailMessageParty,
  getInboxTaskRouteHref,
  getScopedProjectTaskHref,
  listInboundPartyAddresses,
  matchEmailMessageParty,
  parseReplyToAddress,
  replySubject as formatReplySubject,
  resolveEmailMessagePartyAddress,
  resolveEmailThreadMetadataKey,
  resolveOrganizationAvatarSrc,
  useMentionCatalogOptional,
  type EmailAgentActionCardId,
  type EmailComposerMeetingSubmit,
  type EmailComposerTaskSubmit,
  type EmailMessagePartyMap,
} from "@backsteros/ui";
import { emailDeleteEntityLabel } from "../lib/delete-email-message";
import { useEmailMessageActions } from "../screens/email/use-email-message-actions";

import {
  formatEmailAgentMeetingCardComment,
  parseEmailAgentMeetingCard,
} from "../lib/email-meeting-card";
import {
  formatEmailAgentTaskCardComment,
  parseEmailAgentTaskCard,
} from "../lib/email-task-card";
import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopApi } from "../lib/api-context";
import {
  fetchInlineAttachmentBlob,
  peekInlineAttachmentBlob,
} from "../lib/email-inline-attachment-cache.js";
import {
  useDesktopAvatarSrcMap,
  withOrganizationAvatarSrc,
} from "../lib/avatar-src";
import { getBrandfetchClientId } from "../lib/brandfetch";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { resolveAgentTaskMentionChip } from "../screens/email/email-page-helpers";
import { useEmailDraftActions } from "../screens/email/use-email-draft-actions";
import { useEmailMessageDetail } from "../screens/email/use-email-message-detail";
import { useEmailThreadComments } from "../screens/email/use-email-thread-comments";
import { useEmailThreadMetadata } from "../screens/email/use-email-thread-metadata";

type TimelineEntry = {
  key: string;
  at: number;
  node: ReactNode;
};

function emailHeaderDisplayName(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim() || "";
  if (!trimmed) return null;
  const angle = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  const name = angle?.[1]?.trim() || null;
  if (!name) return null;
  const email = parseReplyToAddress(trimmed).trim().toLowerCase();
  if (email && name.toLowerCase() === email) return null;
  return name;
}

function resolvePartyDisplayName(input: {
  from?: string | null;
  to?: readonly string[] | null;
  address: string | null;
  isSent: boolean;
}): string | null {
  if (!input.isSent) {
    return emailHeaderDisplayName(input.from);
  }
  const needle = input.address?.trim().toLowerCase() || null;
  for (const raw of input.to ?? []) {
    const email = parseReplyToAddress(raw).trim().toLowerCase();
    if (needle && email !== needle) continue;
    const name = emailHeaderDisplayName(raw);
    if (name) return name;
    if (needle) break;
  }
  return null;
}

function buildPartyFromEntry(
  entry: {
    messageId: string;
    from?: string | null;
    to?: readonly string[] | null;
    cc?: readonly string[] | null;
  },
  parties: EmailMessagePartyMap,
  ourMailboxEmails: ReadonlySet<string>,
  directory?: {
    contacts: readonly {
      id: string;
      organizationId?: string | null;
      email?: string | null;
      emails?: readonly { address?: string | null }[] | null;
    }[];
    organizations: readonly {
      id: string;
      email?: string | null;
      emails?: readonly { address?: string | null }[] | null;
    }[];
    preferAddresses?: readonly string[] | null;
  },
): CommunicationEmailActiveParty {
  const messageId = entry.messageId.trim();
  const fromEmail = parseReplyToAddress(entry.from ?? "")
    .trim()
    .toLowerCase();
  const isSent = Boolean(fromEmail && ourMailboxEmails.has(fromEmail));
  const address = resolveEmailMessagePartyAddress({
    from: entry.from,
    to: entry.to,
    cc: entry.cc,
    isSent,
    ourMailboxEmails,
    contacts: directory?.contacts,
    organizations: directory?.organizations,
    preferAddresses: isSent ? directory?.preferAddresses : null,
  });
  const party = getEmailMessageParty(parties, messageId);
  return {
    messageId,
    address,
    displayName: resolvePartyDisplayName({
      from: entry.from,
      to: entry.to,
      address,
      isSent,
    }),
    contactId: party?.contactId ?? null,
    organizationId: party?.organizationId ?? null,
  };
}

type DesktopCommunicationEmailThreadProps = {
  item: InboxEmailListItem;
  selectedMessageId: string | null;
  onSelectMessage: (messageId: string) => void;
  /** Latest thread message — drives the right-rail / list card identity. */
  onActivePartyChange?: (party: CommunicationEmailActiveParty | null) => void;
  /** Selected message — drives per-message org/contact linking. */
  onSelectedPartyChange?: (party: CommunicationEmailActiveParty | null) => void;
  onMessagePartiesChange?: (parties: EmailMessagePartyMap) => void;
  /** Parent-held map (manual links) merged over local/auto-link state. */
  messageParties?: EmailMessagePartyMap;
  /** Persist auto-discovered parties (merge). Returns updated map from server. */
  onAutoLinkParties?: (
    parties: EmailMessagePartyMap,
  ) => Promise<EmailMessagePartyMap | null | undefined>;
  /** True once the AgentMail thread body is available (cache or network). */
  onReadyChange?: (ready: boolean) => void;
  /** Href of the list neighbor after this thread is deleted or marked spam. */
  resolveRemovalHref?: (removedId: string) => string;
};

/**
 * AgentMail thread for Communication → Chat center pane — selectable cards,
 * sticky email composer dock (reply / note / task / agenda), newest-first
 * timeline so new activity lands at the top.
 */
function DesktopCommunicationEmailThreadView({
  item,
  selectedMessageId,
  onSelectMessage,
  onActivePartyChange,
  onSelectedPartyChange,
  onMessagePartiesChange,
  messageParties: messagePartiesProp,
  onAutoLinkParties,
  onReadyChange,
  resolveRemovalHref,
}: DesktopCommunicationEmailThreadProps) {
  const { client } = useDesktopApi();
  const agentMail = useAgentMail();
  const workspace = useDesktopWorkspaceData();
  const { contacts, projects, organizations, meetings } = workspace;
  const mentionCatalog = useMentionCatalogOptional()?.catalog;
  const draftId = item.draftId?.trim() || undefined;
  const inboxId = item.inboxId;
  const messageId = draftId ? undefined : item.messageId;

  const resolveListReturnHref = useCallback(
    () => resolveRemovalHref?.(item.id) ?? "/communication",
    [item.id, resolveRemovalHref],
  );

  const {
    message,
    loading,
    error,
    setMessage,
    draft,
    setDraft,
    reloadMessageDetail,
  } = useEmailMessageDetail({
    inboxId,
    messageId,
    draftId,
    isCompose: false,
  });

  const metadataState = useEmailThreadMetadata({
    inboxId,
    message,
    setMessage,
  });
  const {
    organizationId,
    contactId,
    assigneeId,
    projectKey,
    promoteEmailThreadStatus,
    handleContactChange,
  } = metadataState;

  const toEmailDetailHref = useCallback(
    (targetInboxId: string, targetMessageId: string) =>
      getEmailItemHref(targetInboxId, targetMessageId),
    [],
  );

  const drafts = useEmailDraftActions({
    inboxId,
    messageId,
    draftId,
    isCompose: false,
    message,
    setMessage,
    draft,
    setDraft,
    reloadMessageDetail,
    promoteEmailThreadStatus,
    toEmailDetailHref,
  });
  const {
    conceptError,
    setConceptError,
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
    setDraftStageWorking,
    replyComposeOpen,
    setReplyComposeOpen,
    replyInboxId,
    setReplyInboxId,
    replyTo,
    setReplyTo,
    replyCc,
    setReplyCc,
    replySubjectText,
    setReplySubjectText,
    saveConceptDraftBody,
    saveConceptReply,
    sendDraft,
    deleteDraft,
  } = drafts;

  const comments = useEmailThreadComments({
    inboxId,
    messageId,
    isCompose: false,
    message,
    setMessage,
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
    reloadMessageDetail,
    listReturnHref: resolveListReturnHref,
    organizationId,
    contactId,
    assigneeId,
    projectKey,
  });
  const {
    threadComments,
    setThreadComments,
    commentSending,
    savingCommentId,
    selectedCommentId,
    setSelectedCommentId,
    deleteThreadComment,
    updateThreadComment,
    postThreadComment,
    commentAgentWorking,
    draftAgentWorking,
    handleSubmitThreadNote,
    handleSubmitThreadComment,
  } = comments;

  const { handleDeleteMessage, emailExtraMenuItems } = useEmailMessageActions({
    inboxId,
    messageId,
    message,
    setMessage,
    setDraft,
    setThreadComments,
    setConceptError,
    reloadMessageDetail,
    toEmailDetailHref,
    listReturnHref: resolveListReturnHref,
  });

  const [agentActionMode, setAgentActionMode] =
    useState<EmailAgentActionCardId>("reply_draft");
  const [entityCreateSending, setEntityCreateSending] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineItemCountRef = useRef(0);

  useEffect(() => {
    // Keep the Communication right rail closed until the thread has content
    // (cached or fetched) so the panel does not flash empty during AgentMail load.
    onReadyChange?.(Boolean(message));
  }, [message, onReadyChange]);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );
  const brandfetchClientId = getBrandfetchClientId();
  const resolveOrgAvatarSrc = useCallback(
    (organizationId: string | null | undefined): string | null => {
      const id = organizationId?.trim();
      if (!id) return null;
      const organization =
        organizations.find((entry) => entry.id === id) ?? null;
      return resolveOrganizationAvatarSrc({
        uploadedSrc: organizationAvatarSrc[id] ?? null,
        avatarStorageKey: organization?.avatarStorageKey,
        website: organization?.website,
        brandfetchClientId,
      });
    },
    [brandfetchClientId, organizationAvatarSrc, organizations],
  );
  const resolveContactAvatarSrc = useCallback(
    (contactId: string | null | undefined): string | null => {
      const id = contactId?.trim();
      if (!id) return null;
      return (
        contactAvatarSrc[id] ??
        workspace.contacts.find((contact) => contact.id === id)?.avatarSrc ??
        null
      );
    },
    [contactAvatarSrc, workspace.contacts],
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
    const add = (raw: string | null | undefined) => {
      const address = raw?.trim().toLowerCase();
      if (address?.includes("@")) emails.add(address);
    };
    add(message?.inboxEmail);
    for (const mailbox of agentMail.mailboxes) {
      add(mailbox.email);
      const contactId = mailbox.contactId?.trim();
      if (!contactId) continue;
      const contact =
        workspace.contacts.find((entry) => entry.id === contactId) ?? null;
      if (!contact) continue;
      add(contact.email);
      for (const entry of contact.emails ?? []) {
        add(entry.address);
      }
    }
    return emails;
  }, [agentMail.mailboxes, message?.inboxEmail, workspace.contacts]);

  const composeMailboxes = useMemo(
    () =>
      agentMail.mailboxes.map((mailbox) => ({
        ...mailbox,
        avatarSrc: mailbox.contactId
          ? contactAvatarSrc[mailbox.contactId] ?? null
          : null,
      })),
    [agentMail.mailboxes, contactAvatarSrc],
  );

  const mailboxSignOffAvatarSrc = useCallback(
    (mailboxInboxId: string | null | undefined) => {
      const id = mailboxInboxId?.trim();
      if (!id) return null;
      return (
        composeMailboxes.find((mailbox) => mailbox.inboxId === id)?.avatarSrc ??
        null
      );
    },
    [composeMailboxes],
  );

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
  const hydratedMetaKeyRef = useRef<string | null>(null);
  const parties = useMemo(
    () => ({ ...localParties, ...(messagePartiesProp ?? {}) }),
    [localParties, messagePartiesProp],
  );

  // Hydrate from thread metadata once per metadata revision. Do not depend on
  // `onMessagePartiesChange` — it is often an inline callback and re-running
  // this effect on every parent render pushed stale fromMeta over newer
  // optimistic links (create-organization-then-link).
  useEffect(() => {
    const fromMeta = message?.threadMetadata?.messageParties;
    if (!fromMeta || Object.keys(fromMeta).length === 0) return;
    const metaKey = `${message?.threadMetadata?.id ?? ""}:${message?.threadMetadata?.updatedAt ?? ""}`;
    setLocalParties((prev) => ({ ...fromMeta, ...prev }));
    if (hydratedMetaKeyRef.current === metaKey) return;
    hydratedMetaKeyRef.current = metaKey;
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
    // Include CRM emails so auto-link retries once contacts/orgs load (or change),
    // instead of freezing the first empty-directory pass for a multi-party thread.
    const directoryFingerprint = [
      ...workspace.contacts.map(
        (contact) =>
          `${contact.id}:${contact.email ?? ""}:${(contact.emails ?? [])
            .map((row) => row.address ?? "")
            .join(",")}`,
      ),
      ...workspace.organizations.map(
        (organization) =>
          `${organization.id}:${organization.email ?? ""}:${(
            organization.emails ?? []
          )
            .map((row) => row.address ?? "")
            .join(",")}`,
      ),
    ]
      .sort()
      .join("|");
    const key = `${item.inboxId}:${threadKey}:${threadEntries
      .map((entry) => entry.messageId)
      .join(",")}:${directoryFingerprint}`;
    if (autoLinkKeyRef.current === key) return;
    autoLinkKeyRef.current = key;

    // Per-message From/To matching only — do not seed thread-level contact/org
    // onto the open message (that mis-files other participants in the thread).
    const existing = {
      ...(message.threadMetadata?.messageParties ?? localParties),
    };
    const discovered = buildEmailMessagePartyAutoLinks({
      messages: threadEntries,
      ourMailboxEmails,
      contacts: workspace.contacts,
      organizations: workspace.organizations,
      existing,
    });
    if (Object.keys(discovered).length === 0) return;

    void (async () => {
      const updated = await onAutoLinkParties(discovered);
      const next = updated ?? { ...existing, ...discovered };
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
      // Do not write party addresses onto contacts during auto-link — that
      // polluted “other” emails (wrong contact kept matching the next From).
      // Manual link handlers call ensureContactHasOtherEmail from the page.
    })();
  }, [
    item.inboxId,
    message,
    onAutoLinkParties,
    onMessagePartiesChange,
    ourMailboxEmails,
    setMessage,
    threadEntries,
    workspace.contacts,
    workspace.organizations,
    localParties,
  ]);

  const inboundPartyAddresses = useMemo(
    () =>
      listInboundPartyAddresses({
        messages: threadEntries,
        ourMailboxEmails,
      }),
    [ourMailboxEmails, threadEntries],
  );

  const partyDirectory = useMemo(
    () => ({
      contacts: workspace.contacts,
      organizations: workspace.organizations,
      preferAddresses: inboundPartyAddresses,
    }),
    [inboundPartyAddresses, workspace.contacts, workspace.organizations],
  );

  useEffect(() => {
    if (!onActivePartyChange) return;
    const entry = threadEntries[0];
    if (!entry?.messageId?.trim()) {
      onActivePartyChange(null);
      return;
    }
    onActivePartyChange(
      buildPartyFromEntry(entry, parties, ourMailboxEmails, partyDirectory),
    );
  }, [
    onActivePartyChange,
    ourMailboxEmails,
    parties,
    partyDirectory,
    threadEntries,
  ]);

  useEffect(() => {
    if (!onSelectedPartyChange) return;
    const selectedId = selectedMessageId?.trim();
    const entry = selectedId
      ? threadEntries.find((row) => row.messageId === selectedId)
      : threadEntries[0];
    if (!entry?.messageId?.trim()) {
      onSelectedPartyChange(null);
      return;
    }
    onSelectedPartyChange(
      buildPartyFromEntry(entry, parties, ourMailboxEmails, partyDirectory),
    );
  }, [
    onSelectedPartyChange,
    ourMailboxEmails,
    parties,
    partyDirectory,
    selectedMessageId,
    threadEntries,
  ]);

  const editingConceptDraft =
    conceptBodyMode === "edit" &&
    Boolean(
      message?.conceptDraft || message?.conceptDraftId || replyComposeOpen,
    );
  const composerActionMode: EmailAgentActionCardId = editingConceptDraft
    ? "reply_draft"
    : agentActionMode;

  const contactOptions = useMemo(
    () =>
      buildContactDropdownOptions(contacts, { avatarSrcById: contactAvatarSrc }),
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
          status: project.status,
        })),
      ),
    [projects],
  );

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withOrganizationAvatarSrc(organizations, organizationAvatarSrc),
      ),
    [organizationAvatarSrc, organizations],
  );

  const taskProjectIdOptions = useMemo(
    () => [
      {
        value: COMPOSE_NO_PROJECT_VALUE,
        label: "No project",
        searchTerms: "inbox triage none",
        icon: <DefaultProjectIcon size={14} />,
      },
      ...filterProjectsForDefaultPicker(projects).map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key} ${project.name}`,
        icon: <ProjectStatusIcon status={project.status} size={14} />,
      })),
    ],
    [projects],
  );

  const assigneeContacts = useMemo(
    () =>
      contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        avatarSrc: contactAvatarSrc[contact.id] ?? null,
      })),
    [contactAvatarSrc, contacts],
  );

  const defaultComposerProjectId = useMemo(() => {
    if (!projectKey) return null;
    return projects.find((entry) => entry.key === projectKey)?.id ?? null;
  }, [projectKey, projects]);

  const emailThreadId =
    message?.threadMetadata?.id?.trim() ||
    message?.emailThreadId?.trim() ||
    null;

  const showDraftWorking = draftAgentWorking || draftStageWorking;
  const conceptDraftActionsDisabled =
    conceptSaving ||
    conceptBodySaving ||
    draftAgentWorking ||
    draftStageWorking;

  const handleComposerSubmit = useCallback(
    async (body: string) => {
      if (composerActionMode === "note") {
        await handleSubmitThreadNote(body);
        return;
      }
      if (composerActionMode === "reply_draft") {
        await handleSubmitThreadComment(body, { intent: "reply_draft" });
        return;
      }
      await handleSubmitThreadComment(body);
    },
    [composerActionMode, handleSubmitThreadComment, handleSubmitThreadNote],
  );

  const handleComposerCreateTask = useCallback(
    async (input: EmailComposerTaskSubmit) => {
      if (!inboxId || !messageId) return;
      setEntityCreateSending(true);
      setConceptError(null);
      try {
        const emailLink: TaskLink = {
          id: crypto.randomUUID().replace(/-/g, "").slice(0, 32),
          url: getEmailItemHref(inboxId, messageId),
          createdAt: new Date().toISOString(),
        };
        const relatedContactIds = contactId ? [contactId] : undefined;
        const linkedEmailIds = emailThreadId ? [emailThreadId] : undefined;
        const created = input.projectId
          ? await workspace.createProjectTask({
              projectId: input.projectId,
              title: input.title,
              description: input.description || undefined,
              status: input.status,
              priority: input.priority,
              dueDate: input.dueDate,
              assigneeId: input.assigneeId,
              relatedContactIds,
              linkedEmailIds,
              links: [emailLink],
            })
          : await workspace.createInboxTask({
              title: input.title,
              description: input.description || undefined,
              status: input.status,
              priority: input.priority,
              dueDate: input.dueDate,
              assigneeId: input.assigneeId,
              relatedContactIds,
              linkedEmailIds,
              links: [emailLink],
            });

        const project = input.projectId
          ? (projects.find((entry) => entry.id === input.projectId) ?? null)
          : null;
        const href =
          project && created.number != null
            ? getScopedProjectTaskHref(project.key, created.number)
            : created.number != null
              ? getInboxTaskRouteHref({ number: created.number })
              : `/tasks/${created.id}`;
        const displayId =
          project && created.number != null
            ? `${project.key}-${created.number}`
            : created.number != null
              ? `IN-${created.number}`
              : null;

        await postThreadComment(
          formatEmailAgentTaskCardComment({
            taskId: created.id,
            number: created.number,
            title: input.title,
            displayId,
            projectKey: project?.key ?? null,
            projectName: project?.name ?? null,
            projectIcon: project?.icon ?? null,
            dueDate: input.dueDate,
            status: input.status,
            priority: input.priority,
            href,
          }),
          "agent",
        );
      } catch (caught) {
        setConceptError(
          caught instanceof Error ? caught.message : "Could not create task.",
        );
      } finally {
        setEntityCreateSending(false);
      }
    },
    [
      contactId,
      emailThreadId,
      inboxId,
      messageId,
      postThreadComment,
      projects,
      setConceptError,
      workspace,
    ],
  );

  const handleComposerCreateMeeting = useCallback(
    async (input: EmailComposerMeetingSubmit) => {
      setEntityCreateSending(true);
      setConceptError(null);
      try {
        const project = input.projectKey
          ? (projects.find((entry) => entry.key === input.projectKey) ?? null)
          : null;
        const created = await workspace.createMeeting({
          title: input.title,
          notes: input.notes || null,
          status: input.status,
          startAt: input.startAt.toISOString(),
          endAt: input.endAt.toISOString(),
          projectId: project?.id ?? null,
          organizationId: input.organizationId,
          attendeeContactIds: input.attendeeContactIds,
        });
        const organization = input.organizationId
          ? (organizations.find((entry) => entry.id === input.organizationId) ??
            null)
          : null;
        await postThreadComment(
          formatEmailAgentMeetingCardComment({
            meetingId: created.id,
            title: input.title,
            href: getCalendarMeetingHref(created.id),
            displayId:
              created.number != null
                ? formatMeetingDisplayId(created.number)
                : null,
            number: created.number,
            startAt: input.startAt.toISOString(),
            endAt: input.endAt.toISOString(),
            projectName: project?.name ?? null,
            projectIcon: project?.icon ?? null,
            organizationName: organization?.name ?? null,
            status: input.status,
          }),
          "agent",
        );
      } catch (caught) {
        setConceptError(
          caught instanceof Error
            ? caught.message
            : "Could not create meeting.",
        );
      } finally {
        setEntityCreateSending(false);
      }
    },
    [organizations, postThreadComment, projects, setConceptError, workspace],
  );

  // Scroll newest activity into view when the timeline grows (notes / tasks / drafts).
  useEffect(() => {
    const count =
      threadEntries.length +
      threadComments.length +
      (replyComposeOpen || message?.conceptDraft ? 1 : 0);
    const grew = count > timelineItemCountRef.current;
    timelineItemCountRef.current = count;
    if (grew && messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = 0;
    }
  }, [
    message?.conceptDraft,
    replyComposeOpen,
    threadComments.length,
    threadEntries.length,
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

  const conceptDraftId =
    message.conceptDraft?.draftId?.trim() || message.conceptDraftId?.trim();
  const draftInboxId = message.conceptDraft?.inboxId?.trim() || inboxId || "";
  const replyActive = replyComposeOpen || Boolean(message.conceptDraft);
  const replyHasBody = Boolean(conceptBodyDraft.trim());
  const showReplyChrome =
    replyActive && !(showDraftWorking && !replyHasBody);
  const resolvedReplyInboxId =
    replyInboxId ||
    draftInboxId ||
    inboxId ||
    composeMailboxes[0]?.inboxId ||
    "";
  const defaultReplyRecipients = buildReplyRecipients({
    message: {
      from: message.from,
      to: message.to ?? [],
      cc: message.cc ?? [],
    },
    inboxEmail: message.inboxEmail,
    replyAll: false,
    threadMessages: message.threadMessages,
  });
  const resolvedReplyTo =
    replyTo ||
    defaultReplyRecipients.to.join(", ") ||
    parseReplyToAddress(message.from);
  const resolvedReplyCc = replyCc;
  const resolvedReplySubject =
    replySubjectText || formatReplySubject(message.subject);

  const linkedContactForFrom = contactId
    ? (contacts.find((entry) => entry.id === contactId) ?? null)
    : null;
  const linkedAssigneeForComments = assigneeId
    ? (contacts.find((entry) => entry.id === assigneeId) ?? null)
    : null;
  const assigneeCommentName =
    linkedAssigneeForComments?.name?.trim() ||
    message.threadMetadata?.assigneeName?.trim() ||
    null;
  const assigneeCommentAvatarSrc = assigneeId
    ? (contactAvatarSrc[assigneeId] ?? null)
    : null;

  const replyDraftActions = (
    <EmailDraftActions
      onSend={
        conceptDraftId
          ? () => {
              void sendDraft(draftInboxId, conceptDraftId, messageId);
            }
          : undefined
      }
      onSaveDraft={() => {
        if (conceptDraftId) {
          void saveConceptDraftBody(
            draftInboxId,
            conceptDraftId,
            conceptBodyDraft,
          );
          return;
        }
        void saveConceptReply(conceptBodyDraft);
      }}
      onDelete={
        conceptDraftId
          ? () => {
              void deleteDraft(draftInboxId, conceptDraftId, messageId);
            }
          : () => {
              setReplyComposeOpen(false);
              setConceptBodyDraft("");
            }
      }
      sending={sending}
      savingDraft={conceptSaving}
      deleting={deleting}
      disabled={conceptDraftActionsDisabled}
      bodyMode={conceptBodyMode}
      onBodyModeChange={(mode) => {
        void handleConceptBodyModeChange(mode);
      }}
      savingBody={conceptBodySaving}
    />
  );

  const replyChrome = showReplyChrome ? (
    <EmailComposeChrome
      variant="reply"
      mailboxes={composeMailboxes}
      inboxId={resolvedReplyInboxId}
      onInboxIdChange={setReplyInboxId}
      to={resolvedReplyTo}
      onToChange={setReplyTo}
      cc={resolvedReplyCc}
      onCcChange={setReplyCc}
      subject={resolvedReplySubject}
      onSubjectChange={setReplySubjectText}
      body={conceptBodyDraft}
      bodyMode={conceptBodyMode}
      onBodyChange={setConceptBodyDraft}
      replyGreeting={message.conceptDraft?.greeting}
      replySignOff={message.conceptDraft?.signOff}
      replySignOffAvatarSrc={mailboxSignOffAvatarSrc(resolvedReplyInboxId)}
      toContact={{
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
          ? (contactAvatarSrc[contactId] ?? null)
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
      }}
      fieldsDisabled={
        conceptSaving ||
        conceptBodySaving ||
        draftAgentWorking ||
        draftStageWorking
      }
      agentWorking={showDraftWorking && replyHasBody}
      actions={replyDraftActions}
    />
  ) : null;

  const replyTimestampMs = (() => {
    // Newest-first list: pin the open reply draft to the top.
    if (replyActive) return Number.MAX_SAFE_INTEGER;
    const raw = message.conceptDraft?.updatedAt;
    if (raw) {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  })();

  const timelineEntries: TimelineEntry[] = [];

  for (const entry of threadEntries) {
    const fromEmail = parseReplyToAddress(entry.from ?? "")
      .trim()
      .toLowerCase();
    const isSent = Boolean(fromEmail && ourMailboxEmails.has(fromEmail));
    const toList = entry.to ?? [];
    const party = getEmailMessageParty(parties, entry.messageId);
    const partyAddress = resolveEmailMessagePartyAddress({
      from: entry.from,
      to: toList,
      cc: entry.cc,
      isSent,
      ourMailboxEmails,
      contacts: workspace.contacts,
      organizations: workspace.organizations,
      preferAddresses: isSent ? inboundPartyAddresses : null,
    });
    // Match the right rail: honor explicit message-party links. Soft-match only
    // when this message has no stored party yet — never after an unlink (stored
    // contactId/organizationId null) so a former contact photo cannot stick.
    let avatarSrc: string | null = null;
    if (isSent) {
      const mailbox = agentMail.mailboxes.find(
        (row) =>
          row.email?.trim().toLowerCase() === fromEmail ||
          row.email?.trim().toLowerCase() ===
            message.inboxEmail?.trim().toLowerCase(),
      );
      const mailboxContactId = mailbox?.contactId?.trim();
      if (mailboxContactId) {
        avatarSrc = resolveContactAvatarSrc(mailboxContactId);
      }
      avatarSrc = avatarSrc || mailbox?.avatarSrc?.trim() || null;
    } else if (party?.contactId) {
      avatarSrc =
        resolveContactAvatarSrc(party.contactId) ||
        resolveOrgAvatarSrc(
          workspace.contacts.find((contact) => contact.id === party.contactId)
            ?.organizationId,
        );
    } else if (party?.organizationId) {
      avatarSrc = resolveOrgAvatarSrc(party.organizationId);
    } else if (!(entry.messageId in parties) && partyAddress) {
      const matched = matchEmailMessageParty({
        address: partyAddress,
        contacts: workspace.contacts,
        organizations,
      });
      if (matched?.contactId) {
        avatarSrc =
          resolveContactAvatarSrc(matched.contactId) ||
          resolveOrgAvatarSrc(matched.organizationId);
      } else if (matched?.organizationId) {
        avatarSrc = resolveOrgAvatarSrc(matched.organizationId);
      }
    }

    const parsed = Date.parse(String(entry.timestamp ?? ""));
    timelineEntries.push({
      key: `email:${entry.messageId}`,
      at: Number.isFinite(parsed) ? parsed : 0,
      node: (
        <EmailThreadMessageCard
          messageId={entry.messageId}
          subject={entry.subject?.trim() || "(no subject)"}
          from={entry.from}
          to={toList}
          timestamp={entry.timestamp ?? Date.now()}
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
                : entry.from?.trim()) || (isSent ? "Sent" : "Received"),
          }}
        />
      ),
    });
  }

  for (const comment of threadComments) {
    const parsed = Date.parse(comment.createdAt);
    const at = Number.isFinite(parsed) ? parsed : 0;
    const taskCard = parseEmailAgentTaskCard(comment.body);
    const meetingCard = taskCard
      ? null
      : parseEmailAgentMeetingCard(comment.body);
    const bubbleProps = {
      author: comment.author,
      timestamp: comment.createdAt,
      authorName: comment.author === "agent" ? assigneeCommentName : null,
      authorAvatarSrc:
        comment.author === "agent" ? assigneeCommentAvatarSrc : null,
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
      timelineEntries.push({
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
                    formatEmailAgentTaskCardComment(taskCard.card, nextBody),
                  )
                }
              />
            ) : null}
            <div className="mention-task-block">
              <TaskMentionBlockChip task={chip.task} href={chip.href} />
            </div>
          </div>
        ),
      });
      continue;
    }

    if (meetingCard) {
      const note = meetingCard.note.trim();
      const live =
        meetings.find((entry) => entry.id === meetingCard.card.meetingId) ??
        null;
      const liveProject = live?.projectId
        ? (projects.find((entry) => entry.id === live.projectId) ?? null)
        : null;
      const displayId =
        meetingCard.card.displayId?.trim() ||
        (live && live.number > 0
          ? formatMeetingDisplayId(live.number)
          : meetingCard.card.number != null && meetingCard.card.number > 0
            ? formatMeetingDisplayId(meetingCard.card.number)
            : null);
      timelineEntries.push({
        key: `comment-meeting:${comment.id}`,
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
                    formatEmailAgentMeetingCardComment(
                      meetingCard.card,
                      nextBody,
                    ),
                  )
                }
              />
            ) : null}
            <div className="mention-task-block">
              <MeetingMentionBlockChip
                meeting={{
                  title: live?.title?.trim() || meetingCard.card.title,
                  displayId,
                  startAt: live?.startAt ?? meetingCard.card.startAt,
                  endAt: live?.endAt ?? meetingCard.card.endAt,
                  projectName:
                    live?.projectName ??
                    liveProject?.name ??
                    meetingCard.card.projectName,
                  projectIcon:
                    liveProject?.icon ?? meetingCard.card.projectIcon,
                  organizationName:
                    live?.organizationName ??
                    meetingCard.card.organizationName,
                }}
                href={getCalendarMeetingHref(meetingCard.card.meetingId)}
              />
            </div>
          </div>
        ),
      });
      continue;
    }

    timelineEntries.push({
      key: `comment:${comment.id}`,
      at,
      node: (
        <EmailThreadCommentBubble
          {...bubbleProps}
          body={comment.body}
          onSaveEdit={(nextBody) => updateThreadComment(comment.id, nextBody)}
        />
      ),
    });
  }

  if (replyChrome) {
    timelineEntries.push({
      key: `reply:${conceptDraftId ?? "draft"}`,
      at: replyTimestampMs,
      node: replyChrome,
    });
  }

  // Newest activity at the top; composer stays sticky at the bottom.
  timelineEntries.sort((left, right) => right.at - left.at);

  return (
    <>
      {inboxId && messageId ? (
        <>
          <RegisterEntityDeleteAction
            entityLabel={emailDeleteEntityLabel(message.subject)}
            confirmLabel="Delete thread"
            actionVerb="Delete"
            onDelete={handleDeleteMessage}
          />
          <RegisterEntityMenuItems items={emailExtraMenuItems} />
        </>
      ) : null}
      <div
        className="communication-chat__thread-body communication-chat__email-thread"
        data-agent-composer-mode={composerActionMode}
      >
      <div className="communication-chat__thread-container">
        <div className="communication-chat__messages-wrap">
          <div
            ref={messagesScrollRef}
            className="communication-chat__messages communication-chat__email-messages email-detail-scrollport--fade"
          >
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
            {timelineEntries.map((entry) => (
              <Fragment key={entry.key}>{entry.node}</Fragment>
            ))}
          </div>

          <div className="email-thread-composer-dock communication-chat__email-composer-dock">
            <div className="email-thread-composer-dock__main">
              <div className="email-thread-composer-dock__inner">
                {editingConceptDraft ? null : (
                  <EmailAgentActionCards
                    selectedId={agentActionMode}
                    disabled={
                      conceptSaving ||
                      conceptBodySaving ||
                      commentSending ||
                      entityCreateSending
                    }
                    onSelect={(card) => {
                      if (card.id === agentActionMode) return;
                      setAgentActionMode(card.id);
                    }}
                  />
                )}
                <EmailThreadCommentComposer
                  mode={composerActionMode}
                  onSubmit={handleComposerSubmit}
                  onSubmitTask={handleComposerCreateTask}
                  onSubmitMeeting={handleComposerCreateMeeting}
                  disabled={conceptSaving || conceptBodySaving}
                  sending={
                    commentSending ||
                    commentAgentWorking ||
                    draftStageWorking ||
                    draftAgentWorking ||
                    entityCreateSending
                  }
                  contacts={assigneeContacts}
                  projectIdOptions={taskProjectIdOptions}
                  projectKeyOptions={projectOptions}
                  organizationOptions={organizationOptions}
                  contactOptions={contactOptions}
                  defaultProjectId={defaultComposerProjectId}
                  defaultProjectKey={projectKey}
                  defaultAssigneeId={assigneeId}
                  defaultOrganizationId={organizationId}
                  defaultAttendeeContactIds={contactId ? [contactId] : []}
                  contextLabel={editingConceptDraft ? "Concept draft" : null}
                  placeholder={
                    composerActionMode === "note"
                      ? "Add a note on this email…"
                      : composerActionMode === "task"
                        ? "Add a description…"
                        : composerActionMode === "calendar"
                          ? "Add notes…"
                          : editingConceptDraft
                            ? "Ask AI to update this draft…"
                            : "Ask AI to draft a reply…"
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export const DesktopCommunicationEmailThread = memo(DesktopCommunicationEmailThreadView);
