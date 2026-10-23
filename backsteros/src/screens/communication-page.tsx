import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CommunicationChatView,
  FinanceSyncIcon,
  RegisterEntityDeleteAction,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildEmailRelatedPropertyOptions,
  buildInboxTaskListItem,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskRelatedDropdownOptions,
  emailListItemPartyEmail,
  emailListItemPartyName,
  formatEmailListPartyLabel,
  encodeTaskSlug,
  findCommunicationItemBySlugOrId,
  getCommunicationHref,
  getCommunicationItemHref,
  getInboxItemDisplayId,
  getInboxTaskRouteSlugForTask,
  inboxListItemToTaskItemRowTask,
  matchEmailMessageParty,
  normalizeEmailRecipients,
  resolveEmailThreadMetadataKey,
  resolveOrganizationAvatarSrc,
  resolveSupportParties,
  uniqueEmailPartyContactIds,
  type CommunicationCreateKind,
  type EmailMessagePartyMap,
  type InboxEmailListItem,
  type InboxTaskListItem,
  type TaskStatus,
} from "@backsteros/ui";

/** Synthetic message id for Communication new-email party linking. */
const COMPOSE_PARTY_MESSAGE_ID = "compose";

type ComposeEmailMeta = {
  status: string;
  priority: number;
  dueDate: number | null;
  assigneeId: string | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
};

const EMPTY_COMPOSE_EMAIL_META: ComposeEmailMeta = {
  status: "triage",
  priority: 0,
  dueDate: null,
  assigneeId: null,
  projectId: null,
  projectKey: null,
  projectName: null,
};

import { DesktopChatContactDetailPanel } from "../components/desktop-chat-contact-detail-panel";
import { DesktopCommunicationEmailCompose } from "../components/desktop-communication-email-compose";
import {
  DesktopCommunicationEmailThread,
  type CommunicationEmailActiveParty,
} from "../components/desktop-communication-email-thread";
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
import { patchEmailTaskListItem } from "../lib/email-list-tasks";
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
import { matchChatContact } from "../lib/chat/match-chat-contact";
import { useChatInbox } from "../lib/chat/use-chat-inbox";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { parseTaskLinks } from "../lib/workspace/row-mappers";
import { rememberSectionEntryHrefs } from "../lib/section-entry-store";

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
  /** Instant highlight while the router catches up to `/communication/:id`. */
  const [optimisticChatItemId, setOptimisticChatItemId] = useState<
    string | null
  >(null);
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

  const routeChatItemId = routeItemId?.trim() || null;

  useEffect(() => {
    if (
      optimisticChatItemId &&
      routeChatItemId &&
      optimisticChatItemId === routeChatItemId
    ) {
      setOptimisticChatItemId(null);
    }
  }, [optimisticChatItemId, routeChatItemId]);

  const chatItemId = optimisticChatItemId ?? routeChatItemId;

  const selectedChatListItem = useMemo(() => {
    if (!chatItemId) return null;
    if (chatInbox.conversations.some((row) => row.id === chatItemId)) {
      return null;
    }
    return findCommunicationItemBySlugOrId(communicationItems, chatItemId);
  }, [chatItemId, chatInbox.conversations, communicationItems]);

  const selectedEmailId = useMemo(() => {
    if (!chatItemId) return null;
    if (selectedChatListItem?.kind === "email") return selectedChatListItem.id;
    if (chatItemId.startsWith("email:")) return chatItemId;
    return null;
  }, [chatItemId, selectedChatListItem]);

  const selectedSupportId = useMemo(() => {
    if (!chatItemId || selectedEmailId) return null;
    if (selectedChatListItem?.kind === "task") return selectedChatListItem.id;
    return null;
  }, [chatItemId, selectedChatListItem, selectedEmailId]);

  const selectedChatConversationId =
    chatItemId && !selectedEmailId && !selectedSupportId ? chatItemId : null;

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

  // Drive the chat inbox from the URL (and optimistic click) selection.
  useEffect(() => {
    if (selectedEmailId) {
      if (chatInbox.selectedId != null) chatInbox.selectConversation(null);
      const emailItem = communicationItems.find(
        (entry) => entry.kind === "email" && entry.id === selectedEmailId,
      );
      if (emailItem?.kind === "email") {
        if (emailItem.draftId?.trim()) {
          prefetchEmailDraftDetail(
            client,
            emailItem.inboxId,
            emailItem.draftId,
          );
        } else {
          prefetchEmailMessageDetail(
            client,
            emailItem.inboxId,
            emailItem.messageId,
          );
        }
      }
      return;
    }
    if (selectedSupportId) {
      if (chatInbox.selectedId != null) chatInbox.selectConversation(null);
      return;
    }
    if (selectedChatConversationId) {
      if (chatInbox.selectedId !== selectedChatConversationId) {
        chatInbox.selectConversation(selectedChatConversationId);
      }
      return;
    }
    if (chatInbox.selectedId != null) chatInbox.selectConversation(null);
  }, [
    selectedEmailId,
    selectedSupportId,
    selectedChatConversationId,
    communicationItems,
    chatInbox.selectedId,
    chatInbox.selectConversation,
    client,
  ]);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : workspace.organizations,
  );

  const supportTask = useMemo((): InboxTaskListItem | null => {
    if (!routeItemId) return null;
    const fromList = findCommunicationItemBySlugOrId(
      communicationItems,
      routeItemId,
    );
    if (fromList?.kind === "task") return fromList;

    const normalized = routeItemId.trim().toLowerCase();
    const full = workspace.allTasks.find((task) => {
      if (!task.support) return false;
      if (task.id === routeItemId) return true;
      const slug = getInboxTaskRouteSlugForTask({
        number: task.number,
        projectKey: task.projectKey,
      });
      return (
        slug === normalized ||
        slug.toLowerCase() === normalized ||
        encodeTaskSlug(task.projectKey ?? "in", task.number) === normalized
      );
    });
    if (!full) return null;

    return buildInboxTaskListItem({
      id: full.id,
      title: full.title,
      number: full.number ?? 0,
      status: full.status,
      priority: full.priority,
      dueDate:
        typeof full.dueDate === "number"
          ? full.dueDate
          : full.dueDate
            ? full.dueDate.getTime()
            : null,
      updatedAt: full.updatedAt ?? Date.now(),
      description: null,
      projectId: full.projectId,
      projectKey: full.projectKey ?? null,
      projectName: full.projectName ?? null,
      assigneeId: full.assigneeId ?? null,
      inbox: full.inbox ?? false,
      support: full.support ?? null,
      notification: full.notification ?? null,
    });
  }, [communicationItems, routeItemId, workspace.allTasks]);

  const selectedTaskRecord = useMemo(
    () =>
      supportTask
        ? (workspace.allTasks.find((task) => task.id === supportTask.id) ??
          null)
        : null,
    [supportTask, workspace.allTasks],
  );

  const selectedEmailForCrumb = useMemo((): InboxEmailListItem | null => {
    if (selectedChatListItem?.kind === "email") return selectedChatListItem;
    if (!selectedEmailId) return null;
    const fromList = communicationItems.find(
      (entry): entry is InboxEmailListItem =>
        entry.kind === "email" && entry.id === selectedEmailId,
    );
    return fromList ?? null;
  }, [communicationItems, selectedChatListItem, selectedEmailId]);

  const selectedSupportForCrumb = useMemo((): InboxTaskListItem | null => {
    if (supportTask) return supportTask;
    if (selectedChatListItem?.kind === "task") return selectedChatListItem;
    return null;
  }, [selectedChatListItem, supportTask]);

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
            { label: "Communication", href: "/communication" },
            { label: breadcrumbDetailLabel },
          ]
        : [{ label: "Communication" }],
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

  if (location.pathname.startsWith("/email/")) {
    return null;
  }

  const chatEmails = communicationItems.filter(
      (entry): entry is InboxEmailListItem => entry.kind === "email",
    );
    const chatSupportTasks = communicationItems.filter(
      (entry): entry is InboxTaskListItem =>
        entry.kind === "task" && Boolean(entry.support),
    );
    const selectedEmail =
      selectedEmailId == null
        ? null
        : (chatEmails.find((entry) => entry.id === selectedEmailId) ?? null);
    const selectedSupport =
      selectedSupportId == null
        ? null
        : (chatSupportTasks.find((entry) => entry.id === selectedSupportId) ??
          supportTask);
    const selectedEmailIsDraft = Boolean(selectedEmail?.draftId?.trim());
    const isComposingEmail =
      (createOpen && createKind === "email") || selectedEmailIsDraft;
    const composePartyEmail =
      normalizeEmailRecipients(composeTo)[0]?.trim().toLowerCase() || null;
    const selectedConversation =
      selectedEmail || selectedSupport || isComposingEmail
        ? null
        : (chatInbox.conversations.find(
            (row) => row.id === chatInbox.selectedId,
          ) ?? chatInbox.detail);
    const emailPartyEmail = isComposingEmail
      ? composePartyEmail
      : emailActiveParty?.address?.trim() ||
        (selectedEmail ? emailListItemPartyEmail(selectedEmail) : null);
    // Card chrome follows the latest thread message (emailActiveParty).
    // Linking still targets the selected message when the user picks one.
    const latestMessageParty = isComposingEmail
      ? composeParty
      : emailActiveParty
        ? (emailMessageParties[emailActiveParty.messageId] ?? {
            contactId: emailActiveParty.contactId,
            organizationId: emailActiveParty.organizationId,
          })
        : null;
    const selectedMessageParty = isComposingEmail
      ? composeParty
      : selectedEmailMessageId?.trim()
        ? (emailMessageParties[selectedEmailMessageId.trim()] ??
          (emailActiveParty?.messageId === selectedEmailMessageId
            ? {
                contactId: emailActiveParty.contactId,
                organizationId: emailActiveParty.organizationId,
              }
            : null))
        : latestMessageParty;
    // Email: only an explicit message-party contactId counts as filed.
    // Soft-matching by address must not paint the rail as already linked.
    // Card identity comes from the latest message party.
    const matchedContact = isComposingEmail
      ? composeParty.contactId?.trim()
        ? (workspace.contacts.find(
            (contact) => contact.id === composeParty.contactId,
          ) ?? null)
        : null
      : selectedEmail
        ? latestMessageParty?.contactId?.trim()
          ? (workspace.contacts.find(
              (contact) => contact.id === latestMessageParty.contactId,
            ) ?? null)
          : null
        : selectedSupport
          ? supportParties.contact
            ? (workspace.contacts.find(
                (contact) => contact.id === supportParties.contact?.id,
              ) ?? null)
            : null
          : selectedConversation
            ? matchChatContact(workspace.contacts, {
                contactEmail:
                  chatInbox.detail?.contactEmail ??
                  selectedConversation.contactEmail,
                contactPhone:
                  chatInbox.detail?.contactPhone ??
                  selectedConversation.contactPhone,
              })
            : null;
    const matchedOrganization = isComposingEmail
      ? composeParty.organizationId?.trim()
        ? (workspace.organizations.find(
            (organization) => organization.id === composeParty.organizationId,
          ) ?? null)
        : matchedContact?.organizationId?.trim()
          ? (workspace.organizations.find(
              (organization) =>
                organization.id === matchedContact.organizationId,
            ) ?? null)
          : null
      : selectedEmail
        ? latestMessageParty?.organizationId?.trim()
          ? (workspace.organizations.find(
              (organization) =>
                organization.id === latestMessageParty.organizationId,
            ) ?? null)
          : matchedContact?.organizationId?.trim()
            ? (workspace.organizations.find(
                (organization) =>
                  organization.id === matchedContact.organizationId,
              ) ?? null)
            : null
        : selectedSupport
          ? supportParties.organization
            ? (workspace.organizations.find(
                (organization) =>
                  organization.id === supportParties.organization?.id,
              ) ?? null)
            : matchedContact?.organizationId?.trim()
              ? (workspace.organizations.find(
                  (organization) =>
                    organization.id === matchedContact.organizationId,
                ) ?? null)
              : null
          : null;
    const polishedPartyName =
      matchedContact?.name?.trim() ||
      matchedOrganization?.name?.trim() ||
      (isComposingEmail ? null : emailActiveParty?.displayName?.trim()) ||
      null;
    const composeEmailItem: InboxEmailListItem | null =
      createOpen && createKind === "email" && !selectedEmailIsDraft
      ? {
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
        }
      : null;
    // Keep the left-list email card in sync with the latest thread party.
    const chatEmailsForList =
      selectedEmailId && emailActiveParty
        ? chatEmails.map((item) => {
            if (item.id !== selectedEmailId) return item;
            const partyLabel =
              formatEmailListPartyLabel(
                polishedPartyName,
                emailActiveParty.address,
              ) ?? item.partyLabel;
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
              partyLabel,
            };
          })
        : chatEmails;
    // Email: wait for AgentMail thread load before opening the right rail.
    // Create launcher keeps the rail closed; email compose opens it like a thread.
    const chatContactPanelOpen = Boolean(
      isComposingEmail ||
        (!createOpen &&
          (chatInbox.selectedId ||
            (selectedEmailId && emailThreadReady) ||
            selectedSupport)),
    );

    const supportDueDateMs = (() => {
      const raw = selectedTaskRecord?.dueDate ?? selectedSupport?.dueDate ?? null;
      if (raw == null) return null;
      if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
      const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
      return Number.isFinite(ms) ? ms : null;
    })();
    const supportAsEmailItem: InboxEmailListItem | null = selectedSupport
      ? {
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
          dueDate: supportDueDateMs,
          updatedAt: selectedSupport.updatedAt,
          assigneeId:
            selectedTaskRecord?.assigneeId ?? selectedSupport.assigneeId,
          assigneeName: assignee?.name ?? null,
          projectId:
            selectedTaskRecord?.projectId ?? selectedSupport.projectId,
          projectKey: selectedSupport.projectKey,
          projectName: selectedSupport.projectName,
          projectIcon: selectedSupport.projectIcon,
          organizationId: selectedSupport.organizationId ?? null,
          organizationName: selectedSupport.organizationName ?? null,
          contactId: selectedSupport.contactId ?? null,
          contactName: selectedSupport.contactName ?? null,
        }
      : null;
    const contactPickerOptions = buildContactDropdownOptions(
      workspace.contacts,
      { avatarSrcById: contactAvatarSrc },
    );
    const organizationPickerOptions = buildOrganizationDropdownOptions(
      withOrganizationAvatarSrc(
        workspace.organizations,
        organizationAvatarSrc,
      ),
      { includeNone: false },
    );

    const resetComposeState = () => {
      setComposeTo("");
      setComposeParty({ contactId: null, organizationId: null });
      setComposeEmailMeta(EMPTY_COMPOSE_EMAIL_META);
      composePartyManualRef.current = false;
      composeMatchedAddressRef.current = null;
    };
    const handleCreateOpenChange = (open: boolean) => {
      setCreateOpen(open);
      if (!open) {
        setCreateKind(null);
        resetComposeState();
        return;
      }
      setCreateKind(null);
      resetComposeState();
      // Clear the open item so the launcher owns the middle pane + rail.
      setOptimisticChatItemId(null);
      setChatContactCollapsed(true);
      setChatContactExpanded(false);
      setChatMainFaded(false);
      if (routeItemId) {
        navigateToHref(navigate, "/communication", { replace: true });
      }
    };
    const handleCreateKind = (kind: CommunicationCreateKind) => {
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
      // Support / chat create forms land next — keep the launcher open for now
      // so the interaction model is clear while those flows are wired.
      if (kind === "support" || kind === "chat") {
        console.info(
          `[communication] create ${kind} selected — compose UI next`,
        );
      }
    };
    const finishCreate = () => {
      const wasEditingDraft = selectedEmailIsDraft;
      setCreateOpen(false);
      setCreateKind(null);
      resetComposeState();
      resetEmailComposeSession();
      if (wasEditingDraft) {
        setOptimisticChatItemId(null);
        navigateToHref(navigate, "/communication", { replace: true });
      }
    };
    const selectChat = (conversationId: string) => {
      setCreateOpen(false);
      setCreateKind(null);
      resetComposeState();
      setOptimisticChatItemId(conversationId);
      navigateToHref(
        navigate,
        getCommunicationHref(conversationId, "chat"),
      );
    };
    const handleDeleteChatConversation = async () => {
      const conversationId =
        selectedChatConversationId ?? chatInbox.selectedId ?? null;
      if (!conversationId) {
        return { ok: false as const, error: "Conversation is required." };
      }
      setOptimisticChatItemId(null);
      navigateToHref(navigate, "/communication", { replace: true });
      return chatInbox.deleteConversation(conversationId);
    };
    const chatDeleteEntityLabel =
      selectedConversation?.contactName?.trim() ||
      selectedConversation?.contactEmail?.trim() ||
      selectedConversation?.contactPhone?.trim() ||
      "this conversation";
    const selectEmail = (emailId: string) => {
      setCreateOpen(false);
      setCreateKind(null);
      resetComposeState();
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
    };
    const selectSupport = (supportId: string) => {
      setCreateOpen(false);
      setCreateKind(null);
      resetComposeState();
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
    };

    const patchSelectedEmail = async (
      patch: {
        status?: TaskStatus | string;
        priority?: number;
        dueDate?: string | null;
        projectId?: string | null;
        assigneeId?: string | null;
        messageParties?: EmailMessagePartyMap;
        messageParty?: {
          messageId: string;
          contactId?: string | null;
          organizationId?: string | null;
        };
      },
      listExtras?: {
        projectName?: string | null;
        projectKey?: string | null;
        assigneeName?: string | null;
      },
    ) => {
      if (!selectedEmail) return;
      const task = inboxListItemToTaskItemRowTask(selectedEmail);
      if (!task) return;
      if (
        patch.messageParty !== undefined ||
        patch.messageParties !== undefined
      ) {
        const threadKey = resolveEmailThreadMetadataKey({
          kind: selectedEmail.draftId ? "draft" : "message",
          draftId: selectedEmail.draftId,
          threadId: selectedEmail.threadId,
          messageId: selectedEmail.messageId,
        });
        if (!threadKey) return null;
        const metadataBody: {
          messageParties?: EmailMessagePartyMap;
          messageParty?: {
            messageId: string;
            contactId?: string | null;
            organizationId?: string | null;
          };
        } = {};
        if (patch.messageParties !== undefined) {
          metadataBody.messageParties = patch.messageParties;
        }
        if (patch.messageParty !== undefined) {
          metadataBody.messageParty = patch.messageParty;
        }
        const updated = await client.requestJson<{
          messageParties?: EmailMessagePartyMap;
        }>(
          `/api/v1/email/inboxes/${encodeURIComponent(selectedEmail.inboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
          {
            method: "PATCH",
            body: JSON.stringify(metadataBody),
          },
        );
        return updated?.messageParties ?? null;
      }
      await patchEmailTaskListItem(client, task, patch, listExtras);
    };

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
            resolveConversationContactId={(conversation) =>
              matchChatContact(workspace.contacts, {
                contactEmail: conversation.contactEmail,
                contactPhone: conversation.contactPhone,
              })?.id ?? null
            }
            resolveConversationOrganizationId={(conversation) => {
              const matched = matchChatContact(workspace.contacts, {
                contactEmail: conversation.contactEmail,
                contactPhone: conversation.contactPhone,
              });
              return matched?.organizationId?.trim() || null;
            }}
            resolveAvatarSrc={(conversation) => {
              const matched = matchChatContact(workspace.contacts, {
                contactEmail: conversation.contactEmail,
                contactPhone: conversation.contactPhone,
              });
              if (matched) {
                return contactAvatarSrc[matched.id] ?? matched.avatarSrc ?? null;
              }
              return conversation.contactAvatarUrl;
            }}
            resolveContactAvatarSrc={(contactId) => {
              const id = contactId.trim();
              if (!id) return null;
              const contact =
                workspace.contacts.find((entry) => entry.id === id) ?? null;
              return contactAvatarSrc[id] ?? contact?.avatarSrc ?? null;
            }}
            resolveEmailAvatarSrc={(item) => {
              const resolveOrgAvatar = (organizationId: string) => {
                const organization = workspace.organizations.find(
                  (entry) => entry.id === organizationId,
                );
                return resolveOrganizationAvatarSrc({
                  uploadedSrc: organizationAvatarSrc[organizationId] ?? null,
                  avatarStorageKey: organization?.avatarStorageKey,
                  website: organization?.website,
                  brandfetchClientId: getBrandfetchClientId(),
                });
              };

              // Prefer the filed contact/org on the row (latest party for the
              // open thread), then soft-match by party address.
              const contactId = item.contactId?.trim();
              if (contactId) {
                const contact =
                  workspace.contacts.find((entry) => entry.id === contactId) ??
                  null;
                const contactSrc =
                  contactAvatarSrc[contactId] ?? contact?.avatarSrc ?? null;
                if (contactSrc?.trim()) return contactSrc;
                const orgId =
                  contact?.organizationId?.trim() ||
                  item.organizationId?.trim() ||
                  null;
                if (orgId) return resolveOrgAvatar(orgId);
              }

              const organizationId = item.organizationId?.trim();
              if (organizationId) {
                return resolveOrgAvatar(organizationId);
              }

              const matched = matchChatContact(workspace.contacts, {
                contactEmail: emailListItemPartyEmail(item),
              });
              if (matched) {
                const contactSrc =
                  contactAvatarSrc[matched.id] ?? matched.avatarSrc ?? null;
                if (contactSrc?.trim()) return contactSrc;
                const orgId = matched.organizationId?.trim();
                if (orgId) return resolveOrgAvatar(orgId);
              }
              return null;
            }}
            onSelect={selectChat}
            onSelectEmail={selectEmail}
            onSelectSupport={selectSupport}
            onSend={chatInbox.sendMessage}
            createOpen={createOpen}
            createKind={createKind}
            onCreateOpenChange={handleCreateOpenChange}
            onCreateKind={handleCreateKind}
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
                  onMessagePartiesChange={(parties) => {
                    // Merge server/auto-link into parent; keep newer manual keys.
                    setEmailMessageParties((prev) => ({
                      ...parties,
                      ...prev,
                    }));
                  }}
                  onAutoLinkParties={async (parties) => {
                    const updated = await patchSelectedEmail({
                      messageParties: parties,
                    });
                    const next =
                      (updated as EmailMessagePartyMap | null) ?? parties;
                    setEmailMessageParties((prev) => ({ ...next, ...prev }));
                    return next;
                  }}
                  onEnsureContactEmail={ensureContactHasOtherEmail}
                />
              ) : null
            }
            supportThreadSlot={
              selectedSupport ? (
                <div className="communication-chat__support-thread">
                  <TaskDetailView
                    sectionLabel="Communication"
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
          emailActiveParty={
            isComposingEmail
              ? {
                  messageId: COMPOSE_PARTY_MESSAGE_ID,
                  contactId: composeParty.contactId,
                  organizationId:
                    composeParty.organizationId ??
                    matchedContact?.organizationId ??
                    null,
                  partyEmail: emailPartyEmail,
                  partyName:
                    polishedPartyName || emailPartyEmail || "New email",
                }
              : selectedEmail
                ? {
                    messageId: emailActiveParty?.messageId ?? null,
                    contactId: latestMessageParty?.contactId ?? null,
                    organizationId:
                      latestMessageParty?.organizationId ??
                      matchedContact?.organizationId ??
                      null,
                    partyEmail: emailPartyEmail,
                    partyName:
                      polishedPartyName ||
                      emailPartyEmail ||
                      emailListItemPartyName(selectedEmail),
                  }
                : selectedSupport
                  ? {
                      messageId: selectedSupport.id,
                      contactId: supportParties.contact?.id ?? null,
                      organizationId: supportParties.organization?.id ?? null,
                      partyEmail:
                        supportParties.contact?.emails?.[0]?.address ?? null,
                      partyName:
                        supportParties.contact?.name?.trim() ||
                        supportParties.organization?.name?.trim() ||
                        selectedSupport.contactName?.trim() ||
                        selectedSupport.organizationName?.trim() ||
                        selectedSupport.title,
                    }
                  : null
          }
          visitor={
            isComposingEmail
              ? {
                  contactName:
                    polishedPartyName || emailPartyEmail || "New email",
                  contactEmail: emailPartyEmail,
                  contactPhone: null,
                  contactAvatarUrl: matchedContact
                    ? (contactAvatarSrc[matchedContact.id] ??
                      matchedContact.avatarSrc ??
                      null)
                    : matchedOrganization
                      ? resolveOrganizationAvatarSrc({
                          uploadedSrc:
                            organizationAvatarSrc[matchedOrganization.id] ??
                            null,
                          avatarStorageKey:
                            matchedOrganization.avatarStorageKey,
                          website: matchedOrganization.website,
                          brandfetchClientId: getBrandfetchClientId(),
                        })
                      : null,
                }
              : selectedEmail
                ? {
                    contactName:
                      polishedPartyName ||
                      emailPartyEmail ||
                      emailListItemPartyName(selectedEmail),
                    contactEmail: emailPartyEmail,
                    contactPhone: null,
                    contactAvatarUrl: matchedContact
                      ? (contactAvatarSrc[matchedContact.id] ??
                        matchedContact.avatarSrc ??
                        null)
                      : matchedOrganization
                        ? resolveOrganizationAvatarSrc({
                            uploadedSrc:
                              organizationAvatarSrc[matchedOrganization.id] ??
                              null,
                            avatarStorageKey:
                              matchedOrganization.avatarStorageKey,
                            website: matchedOrganization.website,
                            brandfetchClientId: getBrandfetchClientId(),
                          })
                        : null,
                  }
                : selectedSupport
                  ? {
                      contactName:
                        supportParties.contact?.name?.trim() ||
                        supportParties.organization?.name?.trim() ||
                        selectedSupport.contactName?.trim() ||
                        selectedSupport.organizationName?.trim() ||
                        selectedSupport.title,
                      contactEmail:
                        supportParties.contact?.emails?.[0]?.address ?? null,
                      contactPhone:
                        supportParties.contact?.phones?.[0]?.number ?? null,
                      contactAvatarUrl:
                        supportParties.contact?.avatarSrc ??
                        selectedSupport.contactAvatarSrc ??
                        null,
                    }
                  : selectedConversation
                    ? {
                        contactName: selectedConversation.contactName,
                        contactEmail: selectedConversation.contactEmail,
                        contactPhone: selectedConversation.contactPhone,
                        contactAvatarUrl: selectedConversation.contactAvatarUrl,
                      }
                    : null
          }
          conversation={
            selectedEmail || selectedSupport || isComposingEmail
              ? null
              : chatInbox.detail?.id === chatInbox.selectedId
                ? chatInbox.detail
                : (selectedConversation ?? null)
          }
          conversations={chatInbox.conversations}
          emailItem={composeEmailItem ?? selectedEmail ?? supportAsEmailItem}
          statusUpdating={chatInbox.sending}
          propertiesUpdating={chatInbox.sending}
          assigneeOptions={assigneeOptions}
          projectOptions={projectOptions}
          contactOptions={contactPickerOptions}
          organizationOptions={organizationPickerOptions}
          onStatusChange={(status) => {
            void chatInbox.setStatus(status);
          }}
          onAssigneeChange={(assigneeId) => {
            void chatInbox.patchConversation({ assigneeId });
          }}
          onPriorityChange={(priority) => {
            void chatInbox.patchConversation({ priority });
          }}
          onDueDateChange={(dueDate) => {
            void chatInbox.patchConversation({
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onEmailStatusChange={(status) => {
            if (isComposingEmail) {
              setComposeEmailMeta((prev) => ({ ...prev, status }));
              return;
            }
            if (selectedSupport) {
              patchTask({ status });
              return;
            }
            void patchSelectedEmail({ status });
          }}
          onEmailPriorityChange={(priority) => {
            if (isComposingEmail) {
              setComposeEmailMeta((prev) => ({ ...prev, priority }));
              return;
            }
            if (selectedSupport) {
              patchTask({ priority });
              return;
            }
            void patchSelectedEmail({ priority });
          }}
          onEmailDueDateChange={(dueDate) => {
            if (isComposingEmail) {
              setComposeEmailMeta((prev) => ({
                ...prev,
                dueDate: dueDate ? dueDate.getTime() : null,
              }));
              return;
            }
            if (selectedSupport) {
              patchTask({ dueDate: dueDate ? dueDate.toISOString() : null });
              return;
            }
            void patchSelectedEmail({
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onEmailAssigneeChange={(assigneeId) => {
            if (isComposingEmail) {
              setComposeEmailMeta((prev) => ({ ...prev, assigneeId }));
              return;
            }
            if (selectedSupport) {
              patchTask({ assigneeId });
              return;
            }
            const contact = assigneeId
              ? workspace.contacts.find((entry) => entry.id === assigneeId)
              : null;
            void patchSelectedEmail(
              { assigneeId },
              { assigneeName: contact?.name ?? null },
            );
          }}
          onEmailProjectChange={(projectKey) => {
            if (isComposingEmail) {
              const project = projectKey
                ? workspace.projects.find(
                    (entry) =>
                      entry.key.trim().toLowerCase() ===
                      projectKey.trim().toLowerCase(),
                  )
                : null;
              setComposeEmailMeta((prev) => ({
                ...prev,
                projectId: project?.id ?? null,
                projectKey: project?.key ?? null,
                projectName: project?.name ?? null,
              }));
              return;
            }
            if (selectedSupport) {
              const project = projectKey
                ? workspace.projects.find(
                    (entry) =>
                      entry.key.trim().toLowerCase() ===
                      projectKey.trim().toLowerCase(),
                  )
                : null;
              patchTask({
                projectId: project?.id ?? null,
                projectKey: project?.key ?? null,
              });
              return;
            }
            const project = projectKey
              ? workspace.projects.find(
                  (entry) =>
                    entry.key.trim().toLowerCase() ===
                    projectKey.trim().toLowerCase(),
                )
              : null;
            void patchSelectedEmail(
              { projectId: project?.id ?? null },
              {
                projectKey: project?.key ?? null,
                projectName: project?.name ?? null,
              },
            );
          }}
          onLinkOrganization={async (organizationId) => {
            if (isComposingEmail) {
              if (!organizationId) return;
              composePartyManualRef.current = true;
              setComposeParty((prev) => ({
                ...prev,
                organizationId,
              }));
              return;
            }
            if (selectedSupport) {
              if (!organizationId) return;
              patchTask({ relatedOrganizationIds: [organizationId] });
              return;
            }
            if (!selectedEmail || !organizationId) return;
            const messageId =
              emailSelectedParty?.messageId?.trim() ||
              selectedEmailMessageId?.trim() ||
              emailActiveParty?.messageId?.trim() ||
              selectedEmail.messageId;
            const prevContactId =
              selectedMessageParty?.contactId ??
              emailSelectedParty?.contactId ??
              null;
            const nextParty = {
              contactId: prevContactId,
              organizationId,
            };
            // Per-message only — do not write thread-level organizationId.
            const updated = await patchSelectedEmail({
              messageParty: {
                messageId,
                ...nextParty,
              },
            });
            const nextMap = {
              ...emailMessageParties,
              ...((updated as EmailMessagePartyMap | null) ?? {}),
              [messageId]: nextParty,
            };
            setEmailMessageParties(nextMap);
            // Card follows the latest message only — refresh when that one was linked.
            setEmailActiveParty((prev) =>
              prev && prev.messageId === messageId
                ? { ...prev, ...nextParty }
                : prev,
            );
            setEmailSelectedParty((prev) =>
              prev && prev.messageId === messageId
                ? { ...prev, ...nextParty }
                : prev,
            );
          }}
          onLinkContact={async (contactId) => {
            if (isComposingEmail) {
              if (!contactId) return;
              const contact =
                workspace.contacts.find((entry) => entry.id === contactId) ??
                null;
              if (composePartyEmail) {
                await ensureContactHasOtherEmail(contactId, composePartyEmail);
              }
              composePartyManualRef.current = true;
              setComposeParty({
                contactId,
                organizationId:
                  contact?.organizationId?.trim() ||
                  composeParty.organizationId ||
                  null,
              });
              return;
            }
            if (selectedSupport) {
              if (!contactId) return;
              const contact =
                workspace.contacts.find((entry) => entry.id === contactId) ??
                null;
              patchTask({
                relatedContactIds: [contactId],
                contactId,
                relatedOrganizationIds: contact?.organizationId?.trim()
                  ? [contact.organizationId.trim()]
                  : (selectedTaskRecord?.relatedOrganizationIds ?? []),
              });
              return;
            }
            if (!selectedEmail || !contactId) return;
            const contact =
              workspace.contacts.find((entry) => entry.id === contactId) ??
              null;
            const partyEmail =
              emailSelectedParty?.address?.trim() ||
              emailPartyEmail?.trim() ||
              null;
            if (partyEmail) {
              await ensureContactHasOtherEmail(contactId, partyEmail);
            }
            const organizationId =
              contact?.organizationId?.trim() ||
              selectedMessageParty?.organizationId ||
              emailSelectedParty?.organizationId ||
              emailActiveParty?.organizationId ||
              null;
            const messageId =
              emailSelectedParty?.messageId?.trim() ||
              selectedEmailMessageId?.trim() ||
              emailActiveParty?.messageId?.trim() ||
              selectedEmail.messageId;
            const nextParty = {
              contactId,
              organizationId,
            };
            // Per-message only — do not write thread-level contactId/organizationId.
            const updated = await patchSelectedEmail({
              messageParty: {
                messageId,
                ...nextParty,
              },
            });
            const nextMap = {
              ...emailMessageParties,
              ...((updated as EmailMessagePartyMap | null) ?? {}),
              [messageId]: nextParty,
            };
            setEmailMessageParties(nextMap);
            setEmailActiveParty((prev) =>
              prev && prev.messageId === messageId
                ? { ...prev, ...nextParty }
                : prev,
            );
            setEmailSelectedParty((prev) =>
              prev && prev.messageId === messageId
                ? { ...prev, ...nextParty }
                : prev,
            );
          }}
          onUnlinkContact={async () => {
            if (isComposingEmail) {
              composePartyManualRef.current = true;
              setComposeParty((prev) => ({
                ...prev,
                contactId: null,
              }));
              return;
            }
            if (selectedSupport) {
              patchTask({
                relatedContactIds: [],
                contactId: null,
              });
              return;
            }
            if (!selectedEmail) return;
            const messageId =
              emailSelectedParty?.messageId?.trim() ||
              selectedEmailMessageId?.trim() ||
              emailActiveParty?.messageId?.trim() ||
              selectedEmail.messageId;
            const organizationId =
              selectedMessageParty?.organizationId ||
              emailSelectedParty?.organizationId ||
              emailActiveParty?.organizationId ||
              null;
            const nextParty = {
              contactId: null,
              organizationId,
            };
            const updated = await patchSelectedEmail({
              messageParty: {
                messageId,
                ...nextParty,
              },
            });
            const nextMap = {
              ...emailMessageParties,
              ...((updated as EmailMessagePartyMap | null) ?? {}),
              [messageId]: nextParty,
            };
            setEmailMessageParties(nextMap);
            setEmailActiveParty((prev) =>
              prev && prev.messageId === messageId
                ? { ...prev, ...nextParty }
                : prev,
            );
            setEmailSelectedParty((prev) =>
              prev && prev.messageId === messageId
                ? { ...prev, ...nextParty }
                : prev,
            );
          }}
          onSelectConversation={selectChat}
          collapsed={chatContactCollapsed}
          onHide={() => setChatContactCollapsed(true)}
          onShow={() => setChatContactCollapsed(false)}
          onExpandedChange={setChatContactExpanded}
          onChatMainFadedChange={setChatMainFaded}
        />
      </div>
      </>
    );
}
