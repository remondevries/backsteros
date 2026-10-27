import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import type {
  ChatConversation,
  ChatCreateChannel,
} from "@backsteros/contracts";
import {
  CommunicationChatView,
  FinanceSyncIcon,
  RegisterEntityDeleteAction,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildEmailRelatedPropertyOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskRelatedDropdownOptions,
  emailListItemPartyEmail,
  emailListItemPartyName,
  formatEmailListPartyLabel,
  getCommunicationHref,
  getCommunicationHrefAfterRemovingRow,
  getCommunicationItemHref,
  getInboxItemDisplayId,
  matchEmailMessageParty,
  normalizeContactSocialAccounts,
  normalizeEmailRecipients,
  resolveCommunicationEmailParty,
  resolveOrganizationAvatarSrc,
  resolveSupportParties,
  uniqueEmailPartyContactIds,
  type CommunicationCreateKind,
  type CommunicationEmailActiveParty,
  type EmailMessagePartyMap,
  type InboxEmailListItem,
} from "@backsteros/ui";

/** Synthetic message id for Communication new-email party linking. */
const COMPOSE_PARTY_MESSAGE_ID = "compose";

import {
  DesktopChatContactDetailPanel,
  type ChatContactPanelVisitor,
} from "../components/desktop-chat-contact-detail-panel";
import { DesktopCommunicationChannelCreate } from "../components/desktop-communication-channel-create";
import { DesktopCommunicationEmailCompose } from "../components/desktop-communication-email-compose";
import { DesktopCommunicationEmailThread } from "../components/desktop-communication-email-thread";
import { DesktopTaskActivityPanel } from "../components/desktop-task-activity-panel";
import { navigateToHref } from "../router/navigate-href";
import { useDesktopApi } from "../lib/api-context";
import {
  prefetchEmailDraftDetail,
  prefetchEmailMessageDetail,
} from "../lib/email-message-detail-cache";
import {
  readEmailComposeSession,
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../lib/email-compose-session";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useTaskFileAttachments } from "../lib/use-task-file-attachments";
import { useDesktopAvatarSrcMap, withOrganizationAvatarSrc } from "../lib/avatar-src";
import { getBrandfetchClientId } from "../lib/brandfetch";
import {
  normalizeContactEmails,
} from "../lib/contact-row-normalizers";
import { usePostTaskTimerActivity } from "../lib/use-post-task-timer-activity";
import { useTaskDescriptionImages } from "../lib/task-description-images";
import { useDesktopTaskDescription } from "../lib/use-task-description";
import { useTaskLabelDropdownOptions } from "../lib/task-label-options";
import {
  buildDocumentLinkOptions,
  buildEmailLinkOptions,
} from "../lib/task-link-picker-options";
import { useAgentMail } from "../lib/agentmail-context";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useCommunicationListItems } from "../lib/communication/use-communication-list-items";
import {
  chatChannelSocialKind,
  chatChannelSocialOffer,
  chatFacebookMessengerIdOffer,
  findContactForFacebookMessengerOffer,
  matchChatContact,
  resolveChatContact,
} from "../lib/chat/match-chat-contact";
import { useChatInbox } from "../lib/chat/use-chat-inbox";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { parseTaskLinks } from "../lib/workspace/row-mappers";
import { rememberSectionEntryHrefs } from "../lib/section-entry-store";
import {
  EMPTY_COMPOSE_EMAIL_META,
  useCommunicationPropertyHandlers,
  type ComposeEmailMeta,
} from "./communication/use-communication-property-handlers";
import { useCommunicationSelection } from "./communication/use-communication-selection";

export function CommunicationPage() {
  // Stay mounted while the keep-alive pane is frozen. Returning null here
  // unmounted the list (and wiped its cache) so returning from email/spam
  // often painted a blank Everything pane until a full remount/refetch.
  return <CommunicationPageBody />;
}

function CommunicationPageBody() {
  const navigate = useNavigate();
  const location = useShellLocation();
  const { itemId: routeItemId } = useShellParams() as { itemId?: string };
  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen();
  const workspace = useDesktopWorkspaceData();
  const { client } = useDesktopApi();
  const agentMail = useAgentMail();
  const communicationItems = useCommunicationListItems();
  // Unified chat list owns Communication — keep SSE + unread for the section.
  const chatInbox = useChatInbox({
    enabled: keepAliveActive,
    channelFocused: keepAliveActive,
  });
  const [chatContactCollapsed, setChatContactCollapsed] = useState(false);
  const [chatContactExpanded, setChatContactExpanded] = useState(false);
  const [chatMainFaded, setChatMainFaded] = useState(false);
  /** Floating + → type launcher / compose in the center pane (create flow). */
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CommunicationCreateKind | null>(
    null,
  );
  /** To field from embedded compose — drives the right-rail party address. */
  const [composeTo, setComposeTo] = useState("");
  const [composeParty, setComposeParty] = useState<{
    contactId: string | null;
    organizationId: string | null;
  }>({ contactId: null, organizationId: null });
  const [composeEmailMeta, setComposeEmailMeta] = useState<ComposeEmailMeta>(
    EMPTY_COMPOSE_EMAIL_META,
  );
  /** User linked/unlinked in the rail — skip soft-match until To changes. */
  const composePartyManualRef = useRef(false);
  const composeMatchedAddressRef = useRef<string | null>(null);
  const [selectedEmailMessageId, setSelectedEmailMessageId] = useState<
    string | null
  >(null);
  const [emailThreadReady, setEmailThreadReady] = useState(false);
  const [emailActiveParty, setEmailActiveParty] =
    useState<CommunicationEmailActiveParty | null>(null);
  const [emailSelectedParty, setEmailSelectedParty] =
    useState<CommunicationEmailActiveParty | null>(null);
  const [emailMessageParties, setEmailMessageParties] =
    useState<EmailMessagePartyMap>({});
  const prevChatEmailIdRef = useRef<string | null>(null);

  useEffect(() => {
    rememberSectionEntryHrefs({ communication: "/communication" });
  }, []);

  const {
    setOptimisticChatItemId,
    selectedChatListItem,
    selectedEmailId,
    selectedSupportId,
    selectedChatConversationId,
    chatEmails,
    chatSupportTasks,
    supportTask,
    selectedTaskRecord,
    selectedEmail,
    selectedSupport,
    selectedEmailIsDraft,
  } = useCommunicationSelection({
    routeItemId,
    communicationItems,
    conversations: chatInbox.conversations,
    chatLoading: chatInbox.loading,
    chatSelectedId: chatInbox.selectedId,
    selectConversation: chatInbox.selectConversation,
    client,
    allTasks: workspace.allTasks,
  });

  useEffect(() => {
    const emailPanelReady = Boolean(selectedEmailId && emailThreadReady);
    if (selectedChatConversationId || emailPanelReady || selectedSupportId) {
      setChatContactCollapsed(false);
    } else if (
      !selectedChatConversationId &&
      !selectedEmailId &&
      !selectedSupportId
    ) {
      setChatContactExpanded(false);
      setChatMainFaded(false);
    }
  }, [
    selectedChatConversationId,
    selectedEmailId,
    selectedSupportId,
    emailThreadReady,
  ]);

  useEffect(() => {
    if (prevChatEmailIdRef.current === selectedEmailId) return;
    prevChatEmailIdRef.current = selectedEmailId;
    setSelectedEmailMessageId(null);
    setEmailThreadReady(false);
    setEmailActiveParty(null);
    setEmailSelectedParty(null);
    setEmailMessageParties({});
  }, [selectedEmailId]);

  // Deep-link / restore: seed compose session before the composer mounts.
  useLayoutEffect(() => {
    if (!selectedEmailId) return;
    const emailItem = communicationItems.find(
      (entry) => entry.kind === "email" && entry.id === selectedEmailId,
    );
    if (emailItem?.kind !== "email") return;
    const draftId = emailItem.draftId?.trim();
    if (!draftId) return;
    const inboxId = emailItem.inboxId.trim();
    if (!inboxId) return;
    const current = readEmailComposeSession();
    if (current.draftId === draftId && current.inboxId === inboxId) return;
    writeEmailComposeSession({
      sessionId: crypto.randomUUID(),
      draftId,
      inboxId,
    });
    setChatContactCollapsed(false);
    setChatContactExpanded(false);
    setChatMainFaded(false);
  }, [communicationItems, selectedEmailId]);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : workspace.organizations,
  );

  const selectedEmailForCrumb: InboxEmailListItem | null =
    selectedChatListItem?.kind === "email"
      ? selectedChatListItem
      : selectedEmail;

  const selectedSupportForCrumb =
    supportTask ??
    (selectedChatListItem?.kind === "task" ? selectedChatListItem : null);

  const selectedChatForCrumb = useMemo(() => {
    if (!selectedChatConversationId) return null;
    return (
      chatInbox.conversations.find(
        (row) => row.id === selectedChatConversationId,
      ) ??
      (chatInbox.detail?.id === selectedChatConversationId
        ? chatInbox.detail
        : null)
    );
  }, [
    chatInbox.conversations,
    chatInbox.detail,
    selectedChatConversationId,
  ]);

  const breadcrumbDetailLabel = useMemo(() => {
    if (createOpen && createKind === "email") return "New email";
    if (createOpen) return "New";
    if (selectedEmailForCrumb) {
      const party =
        emailListItemPartyName(selectedEmailForCrumb)?.trim() ||
        selectedEmailForCrumb.partyLabel?.trim() ||
        null;
      const subject = selectedEmailForCrumb.title?.trim() || null;
      if (party && subject && party !== subject) return `${party} — ${subject}`;
      return party || subject || "Email";
    }
    if (selectedSupportForCrumb) {
      const displayId = getInboxItemDisplayId(selectedSupportForCrumb);
      return displayId
        ? `${displayId} ${selectedSupportForCrumb.title}`
        : selectedSupportForCrumb.title;
    }
    if (selectedChatForCrumb) {
      return (
        selectedChatForCrumb.contactName?.trim() ||
        selectedChatForCrumb.contactEmail?.trim() ||
        selectedChatForCrumb.contactPhone?.trim() ||
        "Chat"
      );
    }
    return null;
  }, [
    createKind,
    createOpen,
    selectedChatForCrumb,
    selectedEmailForCrumb,
    selectedSupportForCrumb,
  ]);

  const chatBusy = chatInbox.loading;
  const breadcrumbItems = useMemo(
    () =>
      breadcrumbDetailLabel
        ? [
            { label: "Messages", href: "/communication" },
            { label: breadcrumbDetailLabel },
          ]
        : [{ label: "Messages" }],
    [breadcrumbDetailLabel],
  );
  // Must be referentially stable — useRegisterChromeHeader setStates on every
  // new header node, and inline JSX here caused an infinite update loop (ANR).
  const reloadChat = chatInbox.refresh;
  const reloadMail = agentMail.reload;
  const messagesBusy = agentMail.messagesLoading || agentMail.loading;
  const breadcrumbActions = useMemo(
    () => (
      <div className="catalog-chrome-actions">
        <button
          type="button"
          className="catalog-chrome-actions__icon-button"
          aria-label="Refresh chats and email"
          title="Refresh chats and email"
          disabled={chatBusy || messagesBusy}
          onClick={() => {
            reloadChat();
            void reloadMail();
          }}
        >
          <FinanceSyncIcon
            size={14}
            className={
              chatBusy || messagesBusy
                ? "catalog-chrome-actions__sync-icon is-spinning"
                : "catalog-chrome-actions__sync-icon"
            }
          />
        </button>
      </div>
    ),
    [chatBusy, messagesBusy, reloadChat, reloadMail],
  );
  useDesktopSectionBreadcrumb(breadcrumbItems, {
    enabled: keepAliveActive,
    actions: breadcrumbActions,
  });

  const { description: fetchedDescription, rememberDescription } =
    useDesktopTaskDescription(supportTask?.id, {
      enabled: keepAliveActive && Boolean(supportTask?.id),
    });
  const {
    attachments: fileAttachments,
    uploading: fileUploading,
    uploadFile,
    remove: removeFileAttachment,
    open: openFileAttachment,
  } = useTaskFileAttachments(supportTask?.id, {
    enabled: keepAliveActive && Boolean(supportTask?.id),
  });
  const { resolveImageSrc, onUploadImages } = useTaskDescriptionImages(
    supportTask?.id ?? "",
  );
  const [activityFeedBump, setActivityFeedBump] = useState(0);
  const bumpActivityFeed = useCallback(() => {
    setActivityFeedBump((n) => n + 1);
  }, []);
  const postTimerActivity = usePostTaskTimerActivity(
    supportTask?.id,
    bumpActivityFeed,
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(workspace.contacts, { avatarSrcById: contactAvatarSrc }),
    [contactAvatarSrc, workspace.contacts],
  );
  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(workspace.projects, { includeNone: true }),
    [workspace.projects],
  );
  const emailLinkOptions = useMemo(
    () => buildEmailLinkOptions(agentMail.messages),
    [agentMail.messages],
  );
  const emailRelatedOptions = useMemo(
    () => buildEmailRelatedPropertyOptions(agentMail.messages),
    [agentMail.messages],
  );
  const relatedOptions = useMemo(
    () =>
      buildTaskRelatedDropdownOptions({
        contactOptions: assigneeOptions,
        organizationOptions: buildOrganizationDropdownOptions(
          withOrganizationAvatarSrc(workspace.organizations, organizationAvatarSrc),
          { includeNone: false },
        ),
        emailOptions: emailRelatedOptions,
      }),
    [
      assigneeOptions,
      emailRelatedOptions,
      organizationAvatarSrc,
      workspace.organizations,
    ],
  );
  const labelOptions = useTaskLabelDropdownOptions();
  const documentLinkOptions = useMemo(
    () => buildDocumentLinkOptions(workspace.documents),
    [workspace.documents],
  );

  const assignee = useMemo(() => {
    const id = selectedTaskRecord?.assigneeId ?? supportTask?.assigneeId;
    if (!id) return null;
    return workspace.contacts.find((contact) => contact.id === id) ?? null;
  }, [
    selectedTaskRecord?.assigneeId,
    supportTask?.assigneeId,
    workspace.contacts,
  ]);

  const supportParties = useMemo(
    () =>
      resolveSupportParties({
        task: {
          contactId: selectedTaskRecord?.contactId,
          relatedContactIds: selectedTaskRecord?.relatedContactIds ?? [],
          relatedOrganizationIds:
            selectedTaskRecord?.relatedOrganizationIds ?? [],
        },
        contacts: workspace.contacts,
        organizations: workspace.organizations,
        contactAvatarSrc,
        organizationAvatarSrc,
      }),
    [
      contactAvatarSrc,
      organizationAvatarSrc,
      selectedTaskRecord?.contactId,
      selectedTaskRecord?.relatedContactIds,
      selectedTaskRecord?.relatedOrganizationIds,
      workspace.contacts,
      workspace.organizations,
    ],
  );

  const patchTask = useCallback(
    (patch: Record<string, unknown>) => {
      if (!supportTask) return;
      void workspace.patchTask(supportTask.id, patch);
    },
    [supportTask, workspace],
  );

  const ensureContactHasOtherEmail = useCallback(
    async (contactId: string, address: string) => {
      const contact =
        workspace.contacts.find((entry) => entry.id === contactId) ?? null;
      if (!contact) return;
      const existing = normalizeContactEmails(
        workspace.contactDetails[contactId]?.emails ?? contact.emails,
      );
      const needle = address.trim().toLowerCase();
      const already = existing.some(
        (entry) => entry.address.trim().toLowerCase() === needle,
      );
      if (already) return;
      await workspace.patchContact(contactId, {
        emails: [
          ...existing,
          { label: "other" as const, address: address.trim() },
        ],
        ...(contact.email?.trim() ? {} : { email: address.trim() }),
      });
    },
    [workspace],
  );

  // Soft-match compose To against known contacts / orgs (same as thread auto-link).
  useEffect(() => {
    if (!(createOpen && createKind === "email")) {
      composePartyManualRef.current = false;
      composeMatchedAddressRef.current = null;
      return;
    }
    const address =
      normalizeEmailRecipients(composeTo)[0]?.trim().toLowerCase() || null;
    if (address !== composeMatchedAddressRef.current) {
      composePartyManualRef.current = false;
      composeMatchedAddressRef.current = address;
    }
    if (composePartyManualRef.current) return;
    if (!address) {
      setComposeParty({ contactId: null, organizationId: null });
      return;
    }
    const matched = matchEmailMessageParty({
      address,
      contacts: workspace.contacts,
      organizations: workspace.organizations,
    });
    const next = matched ?? { contactId: null, organizationId: null };
    setComposeParty(next);
    if (next.contactId) {
      void ensureContactHasOtherEmail(next.contactId, address);
    }
  }, [
    composeTo,
    createKind,
    createOpen,
    ensureContactHasOtherEmail,
    workspace.contacts,
    workspace.organizations,
  ]);

  const isComposingEmail =
    (createOpen && createKind === "email") || selectedEmailIsDraft;
  const composePartyEmail = useMemo(
    () => normalizeEmailRecipients(composeTo)[0]?.trim().toLowerCase() || null,
    [composeTo],
  );
  const selectedConversation =
    selectedEmail || selectedSupport || isComposingEmail
      ? null
      : (chatInbox.conversations.find(
          (row) => row.id === chatInbox.selectedId,
        ) ?? chatInbox.detail);

  // List card stays on the latest thread message; the right rail follows the
  // selected message’s From address (emailSelectedParty).
  const fallbackPartyEmail = selectedEmail
    ? emailListItemPartyEmail(selectedEmail)
    : null;
  const { focusParty, latestMessageParty, selectedMessageParty, emailPartyEmail } =
    useMemo(
      () =>
        resolveCommunicationEmailParty({
          isComposing: isComposingEmail,
          composeParty,
          composePartyEmail,
          activeParty: emailActiveParty,
          selectedParty: emailSelectedParty,
          messageParties: emailMessageParties,
          fallbackPartyEmail,
          contacts: workspace.contacts,
          organizations: workspace.organizations,
        }),
      [
        composeParty,
        composePartyEmail,
        emailActiveParty,
        emailMessageParties,
        emailSelectedParty,
        fallbackPartyEmail,
        isComposingEmail,
        workspace.contacts,
        workspace.organizations,
      ],
    );

  const { matchedContact, matchedOrganization } = useMemo(() => {
    const findContact = (id: string | null | undefined) =>
      id?.trim()
        ? (workspace.contacts.find((contact) => contact.id === id) ?? null)
        : null;
    const findOrganization = (id: string | null | undefined) =>
      id?.trim()
        ? (workspace.organizations.find((org) => org.id === id) ?? null)
        : null;
    const contact = isComposingEmail
      ? findContact(composeParty.contactId)
      : selectedEmail
        ? findContact(selectedMessageParty?.contactId)
        : selectedSupport
          ? findContact(supportParties.contact?.id)
          : selectedConversation
            ? resolveChatContact(workspace.contacts, {
                contactId:
                  chatInbox.detail?.contactId ??
                  selectedConversation.contactId,
                contactEmail:
                  chatInbox.detail?.contactEmail ??
                  selectedConversation.contactEmail,
                contactPhone:
                  chatInbox.detail?.contactPhone ??
                  selectedConversation.contactPhone,
                contactUsername:
                  chatInbox.detail?.contactUsername ??
                  selectedConversation.contactUsername,
                channelType:
                  chatInbox.detail?.channelType ??
                  selectedConversation.channelType,
              })
            : null;
    const organization = isComposingEmail
      ? (findOrganization(composeParty.organizationId) ??
        findOrganization(contact?.organizationId))
      : selectedEmail
        ? (findOrganization(selectedMessageParty?.organizationId) ??
          findOrganization(contact?.organizationId))
        : selectedSupport
          ? (findOrganization(supportParties.organization?.id) ??
            findOrganization(contact?.organizationId))
          : selectedConversation
            ? (findOrganization(
                chatInbox.detail?.organizationId ??
                  selectedConversation.organizationId,
              ) ?? findOrganization(contact?.organizationId))
            : null;
    return { matchedContact: contact, matchedOrganization: organization };
  }, [
    chatInbox.detail?.channelType,
    chatInbox.detail?.contactId,
    chatInbox.detail?.contactEmail,
    chatInbox.detail?.contactPhone,
    chatInbox.detail?.contactUsername,
    chatInbox.detail?.organizationId,
    composeParty.contactId,
    composeParty.organizationId,
    isComposingEmail,
    selectedConversation,
    selectedEmail,
    selectedMessageParty?.contactId,
    selectedMessageParty?.organizationId,
    selectedSupport,
    supportParties.contact?.id,
    supportParties.organization?.id,
    workspace.contacts,
    workspace.organizations,
  ]);
  const polishedPartyName =
    matchedContact?.name?.trim() ||
    matchedOrganization?.name?.trim() ||
    (isComposingEmail ? null : focusParty?.displayName?.trim()) ||
    null;

  const composeEmailItem = useMemo((): InboxEmailListItem | null => {
    if (!(createOpen && createKind === "email" && !selectedEmailIsDraft)) {
      return null;
    }
    return {
      kind: "email",
      id: `email:compose:${COMPOSE_PARTY_MESSAGE_ID}`,
      inboxId: "",
      messageId: COMPOSE_PARTY_MESSAGE_ID,
      threadId: null,
      title: "New email",
      partyLabel:
        formatEmailListPartyLabel(polishedPartyName, composePartyEmail) ??
        composePartyEmail,
      status: composeEmailMeta.status,
      priority: composeEmailMeta.priority,
      dueDate: composeEmailMeta.dueDate,
      updatedAt: Date.now(),
      assigneeId: composeEmailMeta.assigneeId,
      assigneeName: composeEmailMeta.assigneeId
        ? (workspace.contacts.find(
            (contact) => contact.id === composeEmailMeta.assigneeId,
          )?.name ?? null)
        : null,
      projectId: composeEmailMeta.projectId,
      projectKey: composeEmailMeta.projectKey,
      projectName: composeEmailMeta.projectName,
      projectIcon: null,
      organizationId: composeParty.organizationId,
      organizationName: matchedOrganization?.name?.trim() || null,
      contactId: composeParty.contactId,
      contactName: matchedContact?.name?.trim() || null,
      direction: "sent",
    };
  }, [
    composeEmailMeta,
    composeParty.contactId,
    composeParty.organizationId,
    composePartyEmail,
    createKind,
    createOpen,
    matchedContact?.name,
    matchedOrganization?.name,
    polishedPartyName,
    selectedEmailIsDraft,
    workspace.contacts,
  ]);

  // Keep the left-list email card in sync with the latest thread party.
  const chatEmailsForList = useMemo(() => {
    if (!selectedEmailId || !emailActiveParty) return chatEmails;
    return chatEmails.map((item) => {
      if (item.id !== selectedEmailId) return item;
      return {
        ...item,
        // Prefer the live party map — do not keep a stale list contactId
        // after the user unlinks (null must win over item.contactId).
        contactId: latestMessageParty
          ? latestMessageParty.contactId?.trim() || null
          : item.contactId || null,
        contactName:
          matchedContact?.name?.trim() ||
          (latestMessageParty && !latestMessageParty.contactId
            ? null
            : item.contactName) ||
          null,
        organizationId: latestMessageParty
          ? latestMessageParty.organizationId?.trim() ||
            matchedContact?.organizationId?.trim() ||
            null
          : item.organizationId || null,
        organizationName:
          matchedOrganization?.name?.trim() ||
          (latestMessageParty &&
          !latestMessageParty.organizationId &&
          !matchedContact
            ? null
            : item.organizationName) ||
          null,
        partyContactIds: uniqueEmailPartyContactIds(
          emailMessageParties,
          latestMessageParty?.contactId ?? item.contactId,
        ),
        partyLabel:
          formatEmailListPartyLabel(
            polishedPartyName,
            emailActiveParty.address,
          ) ?? item.partyLabel,
      };
    });
  }, [
    chatEmails,
    emailActiveParty,
    emailMessageParties,
    latestMessageParty,
    matchedContact,
    matchedOrganization?.name,
    polishedPartyName,
    selectedEmailId,
  ]);

  // Email: wait for AgentMail thread load before opening the right rail.
  // Create launcher keeps the rail closed; email compose opens it like a thread.
  const chatContactPanelOpen = Boolean(
    isComposingEmail ||
      (!createOpen &&
        (chatInbox.selectedId ||
          (selectedEmailId && emailThreadReady) ||
          selectedSupport)),
  );

  const supportAsEmailItem = useMemo((): InboxEmailListItem | null => {
    if (!selectedSupport) return null;
    const rawDue =
      selectedTaskRecord?.dueDate ?? selectedSupport.dueDate ?? null;
    const dueMs =
      rawDue == null
        ? null
        : typeof rawDue === "number"
          ? rawDue
          : rawDue instanceof Date
            ? rawDue.getTime()
            : Date.parse(String(rawDue));
    return {
      kind: "email",
      id: selectedSupport.id,
      inboxId: "",
      messageId: selectedSupport.id,
      threadId: null,
      title: selectedSupport.title,
      partyLabel:
        selectedSupport.contactName?.trim() ||
        selectedSupport.organizationName?.trim() ||
        null,
      status: selectedTaskRecord?.status ?? selectedSupport.status,
      priority: selectedTaskRecord?.priority ?? selectedSupport.priority,
      dueDate: dueMs != null && Number.isFinite(dueMs) ? dueMs : null,
      updatedAt: selectedSupport.updatedAt,
      assigneeId: selectedTaskRecord?.assigneeId ?? selectedSupport.assigneeId,
      assigneeName: assignee?.name ?? null,
      projectId: selectedTaskRecord?.projectId ?? selectedSupport.projectId,
      projectKey: selectedSupport.projectKey,
      projectName: selectedSupport.projectName,
      projectIcon: selectedSupport.projectIcon,
      organizationId: selectedSupport.organizationId ?? null,
      organizationName: selectedSupport.organizationName ?? null,
      contactId: selectedSupport.contactId ?? null,
      contactName: selectedSupport.contactName ?? null,
    };
  }, [assignee?.name, selectedSupport, selectedTaskRecord]);

  const contactPickerOptions = useMemo(
    () =>
      buildContactDropdownOptions(workspace.contacts, {
        avatarSrcById: contactAvatarSrc,
      }),
    [contactAvatarSrc, workspace.contacts],
  );
  const organizationPickerOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withOrganizationAvatarSrc(workspace.organizations, organizationAvatarSrc),
        { includeNone: false },
      ),
    [organizationAvatarSrc, workspace.organizations],
  );

  const resolveOrganizationAvatar = useCallback(
    (organizationId: string) => {
      const organization = workspace.organizations.find(
        (entry) => entry.id === organizationId,
      );
      return resolveOrganizationAvatarSrc({
        uploadedSrc: organizationAvatarSrc[organizationId] ?? null,
        avatarStorageKey: organization?.avatarStorageKey,
        website: organization?.website,
        brandfetchClientId: getBrandfetchClientId(),
      });
    },
    [organizationAvatarSrc, workspace.organizations],
  );

  const railEmailActiveParty = useMemo(() => {
    if (isComposingEmail) {
      return {
        messageId: COMPOSE_PARTY_MESSAGE_ID,
        contactId: composeParty.contactId,
        organizationId:
          composeParty.organizationId ?? matchedContact?.organizationId ?? null,
        partyEmail: emailPartyEmail,
        partyName: polishedPartyName || emailPartyEmail || "New email",
      };
    }
    if (selectedEmail) {
      return {
        messageId: focusParty?.messageId ?? null,
        contactId: selectedMessageParty?.contactId ?? null,
        organizationId:
          selectedMessageParty?.organizationId ??
          matchedContact?.organizationId ??
          null,
        partyEmail: emailPartyEmail,
        partyName:
          polishedPartyName ||
          emailPartyEmail ||
          emailListItemPartyName(selectedEmail),
      };
    }
    if (selectedSupport) {
      return {
        messageId: selectedSupport.id,
        contactId: supportParties.contact?.id ?? null,
        organizationId: supportParties.organization?.id ?? null,
        partyEmail: supportParties.contact?.emails?.[0]?.address ?? null,
        partyName:
          supportParties.contact?.name?.trim() ||
          supportParties.organization?.name?.trim() ||
          selectedSupport.contactName?.trim() ||
          selectedSupport.organizationName?.trim() ||
          selectedSupport.title,
      };
    }
    return null;
  }, [
    composeParty.contactId,
    composeParty.organizationId,
    emailPartyEmail,
    focusParty?.messageId,
    isComposingEmail,
    matchedContact?.organizationId,
    polishedPartyName,
    selectedEmail,
    selectedMessageParty?.contactId,
    selectedMessageParty?.organizationId,
    selectedSupport,
    supportParties.contact,
    supportParties.organization,
  ]);

  const railVisitor = useMemo((): ChatContactPanelVisitor | null => {
    if (isComposingEmail || selectedEmail) {
      const contactAvatarUrl = matchedContact
        ? (contactAvatarSrc[matchedContact.id] ??
          matchedContact.avatarSrc ??
          null)
        : matchedOrganization
          ? resolveOrganizationAvatar(matchedOrganization.id)
          : null;
      return {
        contactName:
          polishedPartyName ||
          emailPartyEmail ||
          (selectedEmail && !isComposingEmail
            ? emailListItemPartyName(selectedEmail)
            : "New email"),
        contactEmail: emailPartyEmail,
        contactPhone: null,
        contactAvatarUrl,
      };
    }
    if (selectedSupport) {
      return {
        contactName:
          supportParties.contact?.name?.trim() ||
          supportParties.organization?.name?.trim() ||
          selectedSupport.contactName?.trim() ||
          selectedSupport.organizationName?.trim() ||
          selectedSupport.title,
        contactEmail: supportParties.contact?.emails?.[0]?.address ?? null,
        contactPhone: supportParties.contact?.phones?.[0]?.number ?? null,
        contactAvatarUrl:
          supportParties.contact?.avatarSrc ??
          selectedSupport.contactAvatarSrc ??
          null,
      };
    }
    if (selectedConversation) {
      return {
        contactName: selectedConversation.contactName,
        contactEmail: selectedConversation.contactEmail,
        contactPhone: selectedConversation.contactPhone,
        contactUsername:
          chatInbox.detail?.id === selectedConversation.id
            ? (chatInbox.detail.contactUsername ??
              selectedConversation.contactUsername)
            : selectedConversation.contactUsername,
        contactAvatarUrl: selectedConversation.contactAvatarUrl,
      };
    }
    return null;
  }, [
    chatInbox.detail?.contactUsername,
    chatInbox.detail?.id,
    contactAvatarSrc,
    emailPartyEmail,
    isComposingEmail,
    matchedContact,
    matchedOrganization,
    polishedPartyName,
    resolveOrganizationAvatar,
    selectedConversation,
    selectedEmail,
    selectedSupport,
    supportParties.contact,
    supportParties.organization,
  ]);

  const railConversation =
    selectedEmail || selectedSupport || isComposingEmail
      ? null
      : chatInbox.detail?.id === chatInbox.selectedId
        ? chatInbox.detail
        : (selectedConversation ?? null);
  const railEmailItem = composeEmailItem ?? selectedEmail ?? supportAsEmailItem;

  // Thread notice when a chat has an external channel identity (Telegram /
  // Instagram / Facebook) that is missing from a linked contact — or when no
  // BacksterOS contact is linked yet. Stays until the operator acts.
  const [addingChannelSocial, setAddingChannelSocial] = useState(false);
  const channelSocialGap = useMemo(() => {
    if (
      !selectedConversation ||
      selectedEmail ||
      selectedSupport ||
      createOpen
    ) {
      return null;
    }
    const conversation = railConversation ?? selectedConversation;
    const channelUsername = conversation.contactUsername?.trim() || null;
    if (!channelUsername) return null;
    const channelKind = chatChannelSocialKind(conversation.channelType);
    if (!channelKind) return null;

    // Facebook Messenger ID is a contact property (not a social profile).
    if (channelKind === "facebook") {
      const offerContact = findContactForFacebookMessengerOffer(
        workspace.contacts,
        {
          matchedContact,
          contactName: conversation.contactName,
          organizationId:
            conversation.organizationId ?? matchedOrganization?.id ?? null,
        },
      );
      if (offerContact) {
        const details = workspace.contactDetails[offerContact.id];
        const messengerId = chatFacebookMessengerIdOffer(
          {
            facebookMessengerId:
              details?.facebookMessengerId ??
              offerContact.facebookMessengerId ??
              null,
          },
          channelUsername,
        );
        if (messengerId) {
          return {
            mode: "facebook_messenger_id" as const,
            kind: "contact" as const,
            entityId: offerContact.id,
            entityName: offerContact.name?.trim() || "this contact",
            messengerId,
            shouldLinkContact: !matchedContact,
          };
        }
      }
      // External Messenger identity with no contact to attach it to.
      if (!matchedContact) {
        return {
          mode: "link_contact" as const,
          platform: "Facebook" as const,
          displayHandle: channelUsername,
          label: "Facebook Messenger ID" as const,
        };
      }
      return null;
    }

    if (matchedContact) {
      const details = workspace.contactDetails[matchedContact.id];
      const existingSocial = normalizeContactSocialAccounts(
        details?.socialAccounts ?? matchedContact.socialAccounts,
      );
      const offer = chatChannelSocialOffer(existingSocial, {
        channelType: conversation.channelType,
        contactUsername: channelUsername,
      });
      // Facebook social profiles are handled via Messenger ID above.
      if (!offer || offer.platform === "Facebook") return null;
      return {
        mode: "channel_social" as const,
        kind: "contact" as const,
        entityId: matchedContact.id,
        entityName: matchedContact.name?.trim() || "this contact",
        offer,
      };
    }
    const orgId =
      conversation.organizationId?.trim() ||
      matchedOrganization?.id?.trim() ||
      null;
    if (orgId && matchedOrganization && matchedOrganization.id === orgId) {
      const orgDetails = workspace.organizationDetails[orgId];
      const existingSocial = normalizeContactSocialAccounts(
        orgDetails?.socialAccounts,
      );
      const offer = chatChannelSocialOffer(existingSocial, {
        channelType: conversation.channelType,
        contactUsername: channelUsername,
      });
      if (offer && offer.platform !== "Facebook") {
        return {
          mode: "channel_social" as const,
          kind: "organization" as const,
          entityId: orgId,
          entityName: matchedOrganization.name?.trim() || "this organization",
          offer,
        };
      }
    }

            // External channel identity from Chatwoot, but no BacksterOS contact yet.
    const offer = chatChannelSocialOffer([], {
      channelType: conversation.channelType,
      contactUsername: channelUsername,
    });
    if (!offer || offer.platform === "Facebook") return null;
    return {
      mode: "link_contact" as const,
      platform: offer.platform,
      displayHandle: offer.displayHandle ?? offer.handle,
      label:
        offer.platform === "WhatsApp"
          ? ("WhatsApp number" as const)
          : (`${offer.platform} handle` as const),
    };
  }, [
    createOpen,
    matchedContact,
    matchedOrganization,
    railConversation,
    selectedConversation,
    selectedEmail,
    selectedSupport,
    workspace.contactDetails,
    workspace.contacts,
    workspace.organizationDetails,
  ]);
  const addMissingChannelSocial = useCallback(async () => {
    if (!channelSocialGap || channelSocialGap.mode === "link_contact") return;
    setAddingChannelSocial(true);
    try {
      if (channelSocialGap.mode === "facebook_messenger_id") {
        await workspace.patchContact(channelSocialGap.entityId, {
          facebookMessengerId: channelSocialGap.messengerId,
        });
        // Durable-link the chat when Add resolved the contact by name.
        if (
          channelSocialGap.shouldLinkContact &&
          selectedConversation?.id
        ) {
          await chatInbox.patchConversation(
            { contactId: channelSocialGap.entityId },
            selectedConversation.id,
          );
        }
      } else if (channelSocialGap.kind === "contact") {
        await workspace.patchContact(channelSocialGap.entityId, {
          socialAccounts: channelSocialGap.offer.nextAccounts,
        });
      } else {
        await workspace.patchOrganization(channelSocialGap.entityId, {
          socialAccounts: channelSocialGap.offer.nextAccounts,
        });
      }
    } catch (error) {
      console.warn("[desktop] add chat channel identity failed", error);
    } finally {
      setAddingChannelSocial(false);
    }
  }, [channelSocialGap, chatInbox, selectedConversation?.id, workspace]);
  const channelSocialThreadNotice = channelSocialGap ? (
    <div
      className="communication-chat__channel-social-notice"
      role="status"
    >
      <p className="communication-chat__channel-social-notice__copy">
        {channelSocialGap.mode === "link_contact" ? (
          <>
            {channelSocialGap.label}{" "}
            <strong>{channelSocialGap.displayHandle}</strong> came from this
            chat, but it isn&apos;t linked to a BacksterOS contact yet. Connect
            this chat to a contact so future chats can match automatically.
          </>
        ) : channelSocialGap.mode === "facebook_messenger_id" ? (
          <>
            Facebook Messenger ID{" "}
            <strong>{channelSocialGap.messengerId}</strong> is missing from{" "}
            {channelSocialGap.entityName}. Add it so future Messenger chats can
            match this contact automatically.
          </>
        ) : (
          <>
            {channelSocialGap.offer.platform} handle{" "}
            <strong>{channelSocialGap.offer.displayHandle}</strong> is missing
            from {channelSocialGap.entityName}&apos;s social profiles. Add it
            so future chats can match this{" "}
            {channelSocialGap.kind === "organization"
              ? "organization"
              : "contact"}{" "}
            automatically.
          </>
        )}
      </p>
      {channelSocialGap.mode !== "link_contact" ? (
        <div className="communication-chat__channel-social-notice__actions">
          <button
            type="button"
            disabled={addingChannelSocial}
            onClick={() => {
              void addMissingChannelSocial();
            }}
          >
            {addingChannelSocial ? "Adding…" : "Add"}
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const railHandlers = useCommunicationPropertyHandlers({
    client,
    contacts: workspace.contacts,
    projects: workspace.projects,
    isComposingEmail,
    selectedEmail,
    selectedSupport,
    selectedChatConversation: selectedConversation,
    supportRelatedOrganizationIds:
      selectedTaskRecord?.relatedOrganizationIds ?? [],
    patchTask,
    composeParty,
    composePartyEmail,
    composePartyManualRef,
    setComposeParty,
    setComposeEmailMeta,
    ensureContactHasOtherEmail,
    selectedEmailMessageId,
    emailActiveParty,
    emailSelectedParty,
    selectedMessageParty,
    emailPartyEmail,
    setEmailMessageParties,
    setEmailActiveParty,
    setEmailSelectedParty,
    setChatStatus: chatInbox.setStatus,
    patchChatConversation: chatInbox.patchConversation,
  });

  // On-screen row order (after search/filters) from the chat list, so
  // delete/spam/send open the row the user sees next to the removed one.
  const visibleRowIdsRef = useRef<readonly string[]>([]);
  const handleVisibleRowIdsChange = useCallback(
    (rowIds: readonly string[]) => {
      visibleRowIdsRef.current = rowIds;
    },
    [],
  );
  const communicationItemsRef = useRef(communicationItems);
  communicationItemsRef.current = communicationItems;
  const resolveRemovalHref = useCallback(
    (removedId: string) =>
      getCommunicationHrefAfterRemovingRow({
        items: communicationItemsRef.current,
        removedId,
        visibleRowIds: visibleRowIdsRef.current,
      }) ?? "/communication",
    [],
  );

  const resetComposeState = useCallback(() => {
    setComposeTo("");
    setComposeParty({ contactId: null, organizationId: null });
    setComposeEmailMeta(EMPTY_COMPOSE_EMAIL_META);
    composePartyManualRef.current = false;
    composeMatchedAddressRef.current = null;
  }, []);
  const handleCreateOpenChange = useCallback(
    (open: boolean) => {
      setCreateOpen(open);
      setCreateKind(null);
      resetComposeState();
      if (!open) return;
      // Clear the open item so the launcher owns the middle pane + rail.
      setOptimisticChatItemId(null);
      setChatContactCollapsed(true);
      setChatContactExpanded(false);
      setChatMainFaded(false);
      if (routeItemId) {
        navigateToHref(navigate, "/communication", { replace: true });
      }
    },
    [navigate, resetComposeState, routeItemId, setOptimisticChatItemId],
  );
  const handleCreateKind = useCallback(
    (kind: CommunicationCreateKind) => {
      if (kind === "email") {
        // Stay on Communication — compose in the middle pane; left list stays.
        // Open the same org/contact/properties rail as an existing email.
        resetComposeState();
        resetEmailComposeSession();
        setCreateKind("email");
        setCreateOpen(true);
        setChatContactCollapsed(false);
        setChatContactExpanded(false);
        setChatMainFaded(false);
        return;
      }
      if (
        kind === "whatsapp" ||
        kind === "instagram" ||
        kind === "messenger" ||
        kind === "chat" ||
        kind === "support"
      ) {
        resetComposeState();
        setCreateKind(kind);
        setCreateOpen(true);
        setChatContactCollapsed(true);
        setChatContactExpanded(false);
        setChatMainFaded(false);
        return;
      }
      // X remains out of scope — launcher stays open.
    },
    [resetComposeState],
  );

  const channelCreateChannel = useMemo((): ChatCreateChannel | null => {
    if (createKind === "whatsapp") return "whatsapp";
    if (createKind === "instagram") return "instagram";
    if (createKind === "messenger") return "messenger";
    if (createKind === "chat") return "telegram";
    if (createKind === "support") return "support";
    return null;
  }, [createKind]);
  const finishCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateKind(null);
    resetComposeState();
    resetEmailComposeSession();
    // Draft send/delete navigates to the neighbor (or list root) themselves —
    // only clear the optimistic highlight here so we do not bounce twice.
    if (selectedEmailIsDraft) setOptimisticChatItemId(null);
  }, [resetComposeState, selectedEmailIsDraft, setOptimisticChatItemId]);
  const leaveCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateKind(null);
    resetComposeState();
  }, [resetComposeState]);
  const handleChannelCreated = useCallback(
    (detail: { id: string }) => {
      leaveCreate();
      setOptimisticChatItemId(detail.id);
      void chatInbox.refresh();
      void chatInbox.selectConversation(detail.id);
      navigateToHref(navigate, getCommunicationHref(detail.id, "chat"));
    },
    [chatInbox, leaveCreate, navigate, setOptimisticChatItemId],
  );
  const selectChat = useCallback(
    (conversationId: string) => {
      leaveCreate();
      setOptimisticChatItemId(conversationId);
      navigateToHref(navigate, getCommunicationHref(conversationId, "chat"));
    },
    [leaveCreate, navigate, setOptimisticChatItemId],
  );
  const selectEmail = useCallback(
    (emailId: string) => {
      leaveCreate();
      setOptimisticChatItemId(emailId);
      navigateToHref(navigate, getCommunicationHref(emailId, "chat"));
      const item = chatEmails.find((entry) => entry.id === emailId);
      if (!item) return;
      if (item.draftId?.trim()) {
        writeEmailComposeSession({
          sessionId: crypto.randomUUID(),
          draftId: item.draftId.trim(),
          inboxId: item.inboxId,
        });
        prefetchEmailDraftDetail(client, item.inboxId, item.draftId);
        setChatContactCollapsed(false);
        setChatContactExpanded(false);
        setChatMainFaded(false);
        return;
      }
      resetEmailComposeSession();
      prefetchEmailMessageDetail(client, item.inboxId, item.messageId);
    },
    [chatEmails, client, leaveCreate, navigate, setOptimisticChatItemId],
  );
  const selectSupport = useCallback(
    (supportId: string) => {
      leaveCreate();
      const item =
        chatSupportTasks.find((entry) => entry.id === supportId) ?? null;
      const href = item
        ? getCommunicationItemHref(item, communicationItems, {
            channel: "chat",
          })
        : getCommunicationHref(supportId, "chat");
      const slug =
        href.split("?")[0]?.split("/").filter(Boolean).pop() ?? supportId;
      setOptimisticChatItemId(decodeURIComponent(slug));
      navigateToHref(navigate, href);
    },
    [
      chatSupportTasks,
      communicationItems,
      leaveCreate,
      navigate,
      setOptimisticChatItemId,
    ],
  );
  const handleDeleteChatConversation = async () => {
    const conversationId =
      selectedChatConversationId ?? chatInbox.selectedId ?? null;
    if (!conversationId) {
      return { ok: false as const, error: "Conversation is required." };
    }
    setOptimisticChatItemId(null);
    navigateToHref(navigate, resolveRemovalHref(conversationId), {
      replace: true,
    });
    return chatInbox.deleteConversation(conversationId);
  };
  const chatDeleteEntityLabel =
    selectedConversation?.contactName?.trim() ||
    selectedConversation?.contactEmail?.trim() ||
    selectedConversation?.contactPhone?.trim() ||
    "this conversation";

  const resolveConversationContactId = useCallback(
    (conversation: ChatConversation) =>
      resolveChatContact(workspace.contacts, {
        contactId: conversation.contactId,
        contactEmail: conversation.contactEmail,
        contactPhone: conversation.contactPhone,
        contactUsername: conversation.contactUsername,
        channelType: conversation.channelType,
      })?.id ?? null,
    [workspace.contacts],
  );
  const resolveConversationOrganizationId = useCallback(
    (conversation: ChatConversation) =>
      conversation.organizationId?.trim() ||
      resolveChatContact(workspace.contacts, {
        contactId: conversation.contactId,
        contactEmail: conversation.contactEmail,
        contactPhone: conversation.contactPhone,
        contactUsername: conversation.contactUsername,
        channelType: conversation.channelType,
      })?.organizationId?.trim() ||
      null,
    [workspace.contacts],
  );
  const resolveConversationAvatarSrc = useCallback(
    (conversation: ChatConversation) => {
      const matched = resolveChatContact(workspace.contacts, {
        contactId: conversation.contactId,
        contactEmail: conversation.contactEmail,
        contactPhone: conversation.contactPhone,
        contactUsername: conversation.contactUsername,
        channelType: conversation.channelType,
      });
      if (matched) {
        return contactAvatarSrc[matched.id] ?? matched.avatarSrc ?? null;
      }
      return conversation.contactAvatarUrl;
    },
    [contactAvatarSrc, workspace.contacts],
  );
  const resolveContactAvatarSrc = useCallback(
    (contactId: string) => {
      const id = contactId.trim();
      if (!id) return null;
      const contact =
        workspace.contacts.find((entry) => entry.id === id) ?? null;
      return contactAvatarSrc[id] ?? contact?.avatarSrc ?? null;
    },
    [contactAvatarSrc, workspace.contacts],
  );
  const resolveEmailAvatarSrc = useCallback(
    (item: InboxEmailListItem) => {
      // Prefer the filed contact/org on the row (latest party for the
      // open thread), then soft-match by party address.
      const contactId = item.contactId?.trim();
      if (contactId) {
        const contact =
          workspace.contacts.find((entry) => entry.id === contactId) ?? null;
        const contactSrc =
          contactAvatarSrc[contactId] ?? contact?.avatarSrc ?? null;
        if (contactSrc?.trim()) return contactSrc;
        const orgId =
          contact?.organizationId?.trim() || item.organizationId?.trim() || null;
        if (orgId) return resolveOrganizationAvatar(orgId);
      }

      const organizationId = item.organizationId?.trim();
      if (organizationId) return resolveOrganizationAvatar(organizationId);

      const matched = matchChatContact(workspace.contacts, {
        contactEmail: emailListItemPartyEmail(item),
      });
      if (matched) {
        const contactSrc =
          contactAvatarSrc[matched.id] ?? matched.avatarSrc ?? null;
        if (contactSrc?.trim()) return contactSrc;
        const orgId = matched.organizationId?.trim();
        if (orgId) return resolveOrganizationAvatar(orgId);
      }
      return null;
    },
    [contactAvatarSrc, resolveOrganizationAvatar, workspace.contacts],
  );
  const hideContactPanel = useCallback(() => setChatContactCollapsed(true), []);
  const showContactPanel = useCallback(
    () => setChatContactCollapsed(false),
    [],
  );

  if (location.pathname.startsWith("/email/")) {
    return null;
  }
  return (
      <>
      {selectedChatConversationId && selectedConversation ? (
        <RegisterEntityDeleteAction
          entityLabel={chatDeleteEntityLabel}
          confirmLabel="Delete conversation"
          actionVerb="Delete"
          onDelete={handleDeleteChatConversation}
        />
      ) : null}
      <div
        className={[
          "communication-chat-layout",
          "journal-day-layout",
          "desktop-journal-day-layout",
          chatContactPanelOpen && chatContactCollapsed
            ? "is-calendar-collapsed"
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-content-detail
        data-detail-split
        data-calendar-collapsed={
          chatContactPanelOpen && chatContactCollapsed ? "true" : "false"
        }
        data-chat-contact-expanded={chatContactExpanded ? "true" : "false"}
      >
        <div
          className={[
            "journal-day-layout__main",
            chatMainFaded || chatContactExpanded ? "is-expand-faded" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <CommunicationChatView
            conversations={chatInbox.conversations}
            emails={chatEmailsForList}
            supportTasks={chatSupportTasks}
            selectedId={
              selectedEmail || selectedSupport
                ? null
                : (selectedChatConversationId ?? chatInbox.selectedId)
            }
            selectedEmailId={selectedEmailId}
            selectedSupportId={selectedSupport?.id ?? null}
            detail={
              selectedEmail || selectedSupport ? null : chatInbox.detail
            }
            loading={chatInbox.loading}
            detailLoading={chatInbox.detailLoading}
            error={chatInbox.error}
            typingIds={chatInbox.typingIds}
            onTypingChange={chatInbox.setTyping}
            contactFilterOptions={contactPickerOptions}
            organizationFilterOptions={organizationPickerOptions}
            projectFilterOptions={projectOptions}
            resolveConversationContactId={resolveConversationContactId}
            resolveConversationOrganizationId={
              resolveConversationOrganizationId
            }
            resolveAvatarSrc={resolveConversationAvatarSrc}
            resolveContactAvatarSrc={resolveContactAvatarSrc}
            resolveEmailAvatarSrc={resolveEmailAvatarSrc}
            onVisibleRowIdsChange={handleVisibleRowIdsChange}
            onSelect={selectChat}
            onSelectEmail={selectEmail}
            onSelectSupport={selectSupport}
            onSend={chatInbox.sendMessage}
            createOpen={createOpen}
            createKind={createKind}
            onCreateOpenChange={handleCreateOpenChange}
            onCreateKind={handleCreateKind}
            threadNotice={channelSocialThreadNotice}
            channelCreateSlot={
              channelCreateChannel ? (
                <DesktopCommunicationChannelCreate
                  channel={channelCreateChannel}
                  contactOptions={contactPickerOptions}
                  onCancel={leaveCreate}
                  onCreated={handleChannelCreated}
                />
              ) : null
            }
            emailComposeSlot={
              createKind === "email" || selectedEmailIsDraft ? (
                <DesktopCommunicationEmailCompose
                  key={
                    selectedEmail?.draftId?.trim() ||
                    (createKind === "email" ? "new-compose" : "compose")
                  }
                  openDraft={
                    selectedEmailIsDraft && selectedEmail?.draftId?.trim()
                      ? {
                          inboxId: selectedEmail.inboxId,
                          draftId: selectedEmail.draftId.trim(),
                        }
                      : null
                  }
                  onFinished={finishCreate}
                  onToChange={setComposeTo}
                  toContactId={composeParty.contactId}
                  toOrganizationId={composeParty.organizationId}
                  resolveRemovalHref={resolveRemovalHref}
                />
              ) : null
            }
            emailThreadSlot={
              selectedEmail && !selectedEmailIsDraft ? (
                <DesktopCommunicationEmailThread
                  item={selectedEmail}
                  selectedMessageId={selectedEmailMessageId}
                  onSelectMessage={setSelectedEmailMessageId}
                  onActivePartyChange={setEmailActiveParty}
                  onSelectedPartyChange={setEmailSelectedParty}
                  onReadyChange={setEmailThreadReady}
                  messageParties={emailMessageParties}
                  onMessagePartiesChange={railHandlers.onMessagePartiesChange}
                  onAutoLinkParties={railHandlers.onAutoLinkParties}
                  resolveRemovalHref={resolveRemovalHref}
                />
              ) : null
            }
            supportThreadSlot={
              selectedSupport ? (
                <div className="communication-chat__support-thread">
                  <TaskDetailView
                    sectionLabel="Messages"
                    copyIdShortcutEnabled={keepAliveActive}
                    hideProperties
                    task={{
                      id: selectedSupport.id,
                      title: selectedSupport.title,
                      status:
                        selectedTaskRecord?.status ?? selectedSupport.status,
                      priority:
                        selectedTaskRecord?.priority ??
                        selectedSupport.priority,
                      dueDate:
                        selectedTaskRecord?.dueDate ??
                        selectedSupport.dueDate ??
                        null,
                      assigneeId:
                        selectedTaskRecord?.assigneeId ??
                        selectedSupport.assigneeId,
                      assigneeName: assignee?.name ?? null,
                      contactId: selectedTaskRecord?.contactId ?? null,
                      relatedContactIds:
                        selectedTaskRecord?.relatedContactIds ?? [],
                      relatedOrganizationIds:
                        selectedTaskRecord?.relatedOrganizationIds ?? [],
                      linkedEmailIds:
                        selectedTaskRecord?.linkedEmailIds ?? [],
                      projectKey: selectedSupport.projectKey,
                      projectName: selectedSupport.projectName,
                      agentCreatedAt:
                        selectedTaskRecord?.agentCreatedAt ??
                        selectedSupport.agentCreatedAt ??
                        null,
                      agentInboxApprovedAt:
                        selectedTaskRecord?.agentInboxApprovedAt ??
                        selectedSupport.agentInboxApprovedAt ??
                        null,
                      trackedMinutes:
                        selectedTaskRecord?.trackedMinutes ?? null,
                      trackedDurationSeconds:
                        selectedTaskRecord?.trackedDurationSeconds ?? null,
                      support:
                        selectedTaskRecord?.support ??
                        selectedSupport.support ??
                        false,
                      description: fetchedDescription,
                      links: parseTaskLinks(
                        workspace.taskDetails[selectedSupport.id]?.links,
                      ),
                      displayId: getInboxItemDisplayId(selectedSupport),
                    }}
                    assigneeOptions={assigneeOptions}
                    projectOptions={projectOptions}
                    relatedOptions={relatedOptions}
                    documentLinkOptions={documentLinkOptions}
                    emailLinkOptions={emailLinkOptions}
                    fileAttachments={fileAttachments}
                    fileUploading={fileUploading}
                    onUploadFile={async (file) => {
                      await uploadFile(file);
                    }}
                    onRemoveFile={removeFileAttachment}
                    onOpenFile={openFileAttachment}
                    onStatusChange={(next) => patchTask({ status: next })}
                    onPriorityChange={(next) => patchTask({ priority: next })}
                    onDueDateChange={(next) =>
                      patchTask({ dueDate: next ? next.toISOString() : null })
                    }
                    onAssigneeChange={(next) =>
                      patchTask({ assigneeId: next })
                    }
                    onRelatedChange={(related) =>
                      patchTask({
                        relatedContactIds: related.contactIds,
                        relatedOrganizationIds: related.organizationIds,
                        linkedEmailIds: related.emailIds,
                      })
                    }
                    onLabelChange={(labelIds) => patchTask({ labelIds })}
                    labelOptions={labelOptions}
                    onProjectChange={(projectKey) =>
                      patchTask({ projectKey })
                    }
                    onSaveDescription={(description) => {
                      rememberDescription(description);
                      patchTask({ description });
                    }}
                    onUploadImages={onUploadImages}
                    resolveImageSrc={resolveImageSrc}
                    onChangeLinks={(links) => patchTask({ links })}
                    onTimerSessionChange={postTimerActivity}
                    timerSession={{
                      kind: "task",
                      entityId: selectedSupport.id,
                      title: selectedSupport.title,
                      subtitle: getInboxItemDisplayId(selectedSupport),
                      statusKey:
                        selectedTaskRecord?.status ?? selectedSupport.status,
                      href: location.pathname,
                    }}
                    belowDescription={
                      <DesktopTaskActivityPanel
                        taskId={selectedSupport.id}
                        taskUpdatedAt={
                          selectedTaskRecord?.updatedAt ?? null
                        }
                        contacts={workspace.contacts}
                        contactAvatarSrc={contactAvatarSrc}
                        patchTaskValues={async (values) => {
                          await workspace.patchTask(
                            selectedSupport.id,
                            values,
                          );
                        }}
                        activityFeedBump={activityFeedBump}
                        commentResolveMode="ticket"
                        resolveImageSrc={resolveImageSrc}
                        onUploadImages={onUploadImages}
                        taskSummary={{
                          number: selectedSupport.number ?? 0,
                          title: selectedSupport.title,
                          description: fetchedDescription || null,
                          status:
                            selectedTaskRecord?.status ??
                            selectedSupport.status,
                          projectKey: selectedSupport.projectKey,
                          projectId:
                            selectedTaskRecord?.projectId ?? null,
                          projectName: selectedSupport.projectName ?? null,
                          displayId: getInboxItemDisplayId(selectedSupport),
                          agentWorkingContactId:
                            selectedTaskRecord?.agentWorkingContactId ?? null,
                          agentWorkingContactName:
                            selectedTaskRecord?.agentWorkingContactName ??
                            null,
                          agentWorkingKind:
                            selectedTaskRecord?.agentWorkingKind ?? null,
                        }}
                      />
                    }
                  />
                </div>
              ) : null
            }
          />
        </div>
        <DesktopChatContactDetailPanel
          open={chatContactPanelOpen}
          contact={matchedContact}
          supportTicket={Boolean(selectedSupport)}
          emailActiveParty={railEmailActiveParty}
          visitor={railVisitor}
          conversation={railConversation}
          conversations={chatInbox.conversations}
          emailItem={railEmailItem}
          statusUpdating={chatInbox.sending}
          propertiesUpdating={chatInbox.sending}
          assigneeOptions={assigneeOptions}
          projectOptions={projectOptions}
          contactOptions={contactPickerOptions}
          organizationOptions={organizationPickerOptions}
          onStatusChange={railHandlers.onStatusChange}
          onAssigneeChange={railHandlers.onAssigneeChange}
          onPriorityChange={railHandlers.onPriorityChange}
          onDueDateChange={railHandlers.onDueDateChange}
          onEmailStatusChange={railHandlers.onEmailStatusChange}
          onEmailPriorityChange={railHandlers.onEmailPriorityChange}
          onEmailDueDateChange={railHandlers.onEmailDueDateChange}
          onEmailAssigneeChange={railHandlers.onEmailAssigneeChange}
          onEmailProjectChange={railHandlers.onEmailProjectChange}
          onLinkOrganization={railHandlers.onLinkOrganization}
          onUnlinkOrganization={railHandlers.onUnlinkOrganization}
          onLinkContact={railHandlers.onLinkContact}
          onUnlinkContact={railHandlers.onUnlinkContact}
          onSelectConversation={selectChat}
          onSelectEmail={selectEmail}
          onSelectSupport={selectSupport}
          collapsed={chatContactCollapsed}
          onHide={hideContactPanel}
          onShow={showContactPanel}
          onExpandedChange={setChatContactExpanded}
          onChatMainFadedChange={setChatMainFaded}
        />
      </div>
      </>
    );
}
