import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ChatConversation } from "@backsteros/contracts";

import {
  buildInboxEmailListItem,
  buildInboxMessagesModeItems,
  buildInboxTaskListItem,
  findInboxItemBySlugOrId,
  getSelectedInboxSlugFromPathname,
  isInboxPath,
  parseEmailDraftPath,
  parseEmailMessagePath,
  resolveInboxModeListItems,
  sortInboxItemsByAttentionStatus,
  taskBelongsInInbox,
  useInboxListMode,
  type InboxEmailListItem,
  type InboxListItem,
  type InboxListMode,
  type InboxMessagesSources,
  type InboxTaskListItem,
} from "@backsteros/ui";

import { useAgentMail } from "../agentmail-context";
import { agentMailMessagesSignature } from "../agentmail-list-cache";
import { useDesktopAvatarSrcMap } from "../avatar-src";
import { useChatInbox } from "../chat/use-chat-inbox";
import { buildMailboxByIdMap } from "../email-list-tasks";
import {
  useDesktopWorkspaceInboxItems,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceTasks,
  useWorkspaceSurfaceReady,
} from "../workspace-data";
import { dueDateValueToEpochMs } from "../workspace/row-mappers";
import { buildInboxAttentionGroupOverrides } from "./build-inbox-session-list";
import { useInboxListSessionPin } from "./inbox-list-session-context";
import { useInboxSessionList } from "./use-inbox-session-list";
import { useInboxTriageNotifications } from "./use-inbox-triage-notifications";
import { useInboxUpdatedNotifications } from "./use-inbox-updated-notifications";

const NO_ENTITIES: [] = [];
const NO_CONVERSATIONS: ChatConversation[] = [];

export type InboxModeModel = {
  listMode: InboxListMode;
  setListMode: (mode: InboxListMode) => void;
  /** Session list (workspace tasks + support + email, pins applied). */
  items: InboxListItem[];
  /** Rows for `listMode`, in the order the side panel paints them. */
  modeItems: InboxListItem[];
  /** Inbox → Messages sources (same as Communication). */
  messages: InboxMessagesSources;
  /** True only while the active mode has nothing to show yet. */
  loading: boolean;
  /**
   * The active mode's sources are still arriving (rows may be missing).
   * Do not treat "row not in list" as final while this is true.
   */
  pending: boolean;
  ready: boolean;
  attentionGroupOverrides: ReadonlyMap<string, string>;
  /** Shared Chatwoot list + open thread for Inbox → Messages. */
  chat: ReturnType<typeof useChatInbox>;
  contactAvatarSrc: Record<string, string>;
  organizationAvatarSrc: Record<string, string>;
};

const InboxModeModelContext = createContext<InboxModeModel | null>(null);

export function useInboxModeModel(): InboxModeModel {
  const model = useContext(InboxModeModelContext);
  if (!model) {
    throw new Error("useInboxModeModel must be used inside InboxModeModelProvider");
  }
  return model;
}

/**
 * Single owner of Inbox data for the side panel and InboxPage:
 * one membership pass, per-mode loading, and Messages built from the same
 * sources as Communication. While `active` is false the last slices are kept
 * so leaving and returning to Inbox never paints from an empty list.
 */
export function InboxModeModelProvider({
  active,
  pathname,
  children,
}: {
  /** Inbox side panel or page is on screen. */
  active: boolean;
  pathname: string;
  children: ReactNode;
}) {
  const frozen = !active;
  const inboxReady = useWorkspaceSurfaceReady("inbox");
  const inboxItems = useDesktopWorkspaceInboxItems();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { allTasks } = useDesktopWorkspaceTasks();
  const agentMail = useAgentMail();
  const { pinnedItems } = useInboxListSessionPin();
  const [listMode, setListMode] = useInboxListMode();
  const messagesActive = active && listMode === "messages";
  const chatInbox = useChatInbox({
    enabled: messagesActive,
    channelFocused: messagesActive,
  });
  const {
    conversations: chatConversations,
    selectedId: chatSelectedId,
    detail: chatDetail,
    loading: chatLoading,
    detailLoading: chatDetailLoading,
    sending: chatSending,
    error: chatError,
    unreadCount: chatUnreadCount,
    typingIds: chatTypingIds,
    refresh: chatRefresh,
    selectConversation,
    sendMessage,
    setTyping,
    setStatus,
    patchConversation,
    deleteConversation,
    resolve,
    reopen,
  } = chatInbox;
  // useChatInbox returns a fresh object per render; keep context stable.
  const chat = useMemo(
    (): ReturnType<typeof useChatInbox> => ({
      conversations: chatConversations,
      selectedId: chatSelectedId,
      detail: chatDetail,
      loading: chatLoading,
      detailLoading: chatDetailLoading,
      sending: chatSending,
      error: chatError,
      unreadCount: chatUnreadCount,
      typingIds: chatTypingIds,
      refresh: chatRefresh,
      selectConversation,
      sendMessage,
      setTyping,
      setStatus,
      patchConversation,
      deleteConversation,
      resolve,
      reopen,
    }),
    [
      chatConversations,
      chatDetail,
      chatDetailLoading,
      chatError,
      chatLoading,
      chatRefresh,
      chatSelectedId,
      chatSending,
      chatTypingIds,
      chatUnreadCount,
      deleteConversation,
      patchConversation,
      reopen,
      resolve,
      selectConversation,
      sendMessage,
      setStatus,
      setTyping,
    ],
  );

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    frozen ? NO_ENTITIES : contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    frozen ? NO_ENTITIES : organizations,
  );

  const contactsById = useMemo(() => {
    const map = new Map<string, (typeof contacts)[number]>();
    for (const contact of contacts) map.set(contact.id, contact);
    return map;
  }, [contacts]);

  const lastWorkspaceItemsRef = useRef<InboxListItem[]>([]);
  const lastEmailItemsRef = useRef<InboxEmailListItem[]>([]);
  const lastSupportItemsRef = useRef<InboxTaskListItem[]>([]);
  const lastConversationsRef = useRef<ChatConversation[]>(NO_CONVERSATIONS);

  // Inbox tasks with the live task overlay. This is the only membership pass:
  // live due-date / status edits can move a row out of Inbox before the
  // workspace inbox query re-runs.
  const workspaceItems = useMemo((): InboxListItem[] => {
    if (frozen) return lastWorkspaceItemsRef.current;
    const liveTaskById = new Map(allTasks.map((task) => [task.id, task]));
    const next: InboxListItem[] = [];
    for (const item of inboxItems) {
      if (item.kind === "meeting") {
        next.push(
          item.organizationId
            ? {
                ...item,
                organizationAvatarSrc:
                  organizationAvatarSrc[item.organizationId] ?? null,
              }
            : item,
        );
        continue;
      }
      if (item.kind !== "task") {
        next.push(item);
        continue;
      }
      const live = liveTaskById.get(item.id);
      const merged = live
        ? {
            ...item,
            status: live.status ?? item.status,
            priority: live.priority ?? item.priority,
            // Explicit null is an intentional clear — never fall back to the
            // stale inbox snapshot date.
            dueDate: dueDateValueToEpochMs(live.dueDate),
            assigneeId: live.assigneeId ?? item.assigneeId,
          }
        : item;
      if (
        !taskBelongsInInbox({
          inbox: merged.inbox,
          status: merged.status,
          dueDate: merged.dueDate,
          agentCreatedAt: merged.agentCreatedAt,
          agentInboxApprovedAt: merged.agentInboxApprovedAt,
          inboxUpdatedAt: merged.inboxUpdatedAt,
        })
      ) {
        continue;
      }
      const assigneeId = merged.assigneeId;
      const assignee = assigneeId ? contactsById.get(assigneeId) : null;
      next.push({
        ...merged,
        assigneeName: assignee?.name?.trim() || merged.assigneeName || null,
        assigneeAvatarSrc: assigneeId
          ? (contactAvatarSrc[assigneeId] ?? merged.assigneeAvatarSrc ?? null)
          : null,
      });
    }
    lastWorkspaceItemsRef.current = next;
    return next;
  }, [
    allTasks,
    contactAvatarSrc,
    contactsById,
    frozen,
    inboxItems,
    organizationAvatarSrc,
  ]);

  const agentMailListSignature = useMemo(
    () => agentMailMessagesSignature(agentMail.messages),
    [agentMail.messages],
  );
  const agentMailMessagesRef = useRef(agentMail.messages);
  agentMailMessagesRef.current = agentMail.messages;

  const emailItems = useMemo((): InboxEmailListItem[] => {
    if (frozen) return lastEmailItemsRef.current;
    const mailboxById = buildMailboxByIdMap(agentMail.mailboxes);
    const next = agentMailMessagesRef.current.map((item) => {
      const mailbox = mailboxById.get(item.inboxId) ?? null;
      return buildInboxEmailListItem({
        inboxId: item.inboxId,
        messageId: item.id,
        draftId: item.draftId ?? (item.kind === "draft" ? item.id : null),
        threadId: item.threadId,
        title: item.subject,
        from: item.from,
        status: item.status,
        inboxUpdatedAt: item.inboxUpdatedAt,
        priority: item.priority,
        dueDate: item.dueDate,
        updatedAt: item.receivedAt,
        assigneeId: item.assigneeId,
        projectId: item.projectId,
        projectKey: item.projectKey,
        projectName: item.projectName,
        organizationId: item.organizationId,
        organizationName: item.organizationName,
        contactId: item.contactId,
        contactName: item.contactName,
        partyContactIds: item.partyContactIds ?? null,
        emailThreadId: item.emailThreadId,
        number: item.number,
        displayId: item.displayId,
        direction: item.direction ?? null,
        mailboxEmail: mailbox?.email ?? null,
        mailboxLabel: mailbox
          ? mailbox.contactName?.trim() ||
            mailbox.displayName?.trim() ||
            mailbox.email ||
            mailbox.inboxId
          : null,
        mailboxAvatarSrc: mailbox?.contactId
          ? (contactAvatarSrc[mailbox.contactId] ?? null)
          : null,
        assigneeName: item.assigneeId
          ? contactsById.get(item.assigneeId)?.name?.trim() || null
          : null,
        assigneeAvatarSrc: item.assigneeId
          ? (contactAvatarSrc[item.assigneeId] ?? null)
          : null,
        unread: item.unread === true,
      });
    });
    lastEmailItemsRef.current = next;
    return next;
    // `agentMailListSignature` stands in for the messages ref read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    agentMail.mailboxes,
    agentMailListSignature,
    contactAvatarSrc,
    contactsById,
    frozen,
  ]);

  // Same support tickets Communication → Messages loads (may sit outside the
  // inbox SQL window).
  const supportItems = useMemo((): InboxTaskListItem[] => {
    if (frozen) return lastSupportItemsRef.current;
    const organizationsById = new Map(
      organizations.map((organization) => [organization.id, organization]),
    );
    const next = allTasks
      .filter((task) => Boolean(task.support))
      .map((task) => {
        const relatedContactId = task.relatedContactIds?.[0] ?? null;
        const relatedOrganizationId = task.relatedOrganizationIds?.[0] ?? null;
        const relatedContact = relatedContactId
          ? contactsById.get(relatedContactId)
          : undefined;
        const relatedOrganization = relatedOrganizationId
          ? organizationsById.get(relatedOrganizationId)
          : undefined;
        const assigneeId = task.assigneeId ?? null;
        const assignee = assigneeId ? contactsById.get(assigneeId) : null;
        return buildInboxTaskListItem({
          id: task.id,
          title: task.title,
          number: task.number ?? 0,
          status: task.status,
          priority: task.priority,
          dueDate: dueDateValueToEpochMs(task.dueDate),
          updatedAt: task.updatedAt ?? Date.now(),
          description: null,
          projectId: task.projectId,
          projectKey: task.projectKey ?? null,
          projectName: task.projectName ?? null,
          assigneeId,
          assigneeName: assignee?.name?.trim() || null,
          assigneeAvatarSrc: assigneeId
            ? (contactAvatarSrc[assigneeId] ?? null)
            : null,
          inbox: task.inbox ?? false,
          agentCreatedAt: task.agentCreatedAt,
          agentInboxApprovedAt: task.agentInboxApprovedAt,
          inboxUpdatedAt: task.inboxUpdatedAt,
          support: true,
          notification: task.notification ?? null,
          organizationName: relatedOrganization?.name ?? null,
          organizationId: relatedOrganizationId,
          contactName: relatedContact?.name ?? null,
          contactId: relatedContactId,
          contactAvatarSrc: relatedContactId
            ? (contactAvatarSrc[relatedContactId] ?? null)
            : null,
        });
      });
    lastSupportItemsRef.current = next;
    return next;
  }, [allTasks, contactAvatarSrc, contactsById, frozen, organizations]);

  // Keep the last chats while Notifications / Agents are open so switching
  // back to Messages is instant.
  const conversations = useMemo(() => {
    if (!messagesActive) return lastConversationsRef.current;
    lastConversationsRef.current = chat.conversations;
    return chat.conversations;
  }, [chat.conversations, messagesActive]);

  const baseItems = useMemo(() => {
    const supportIds = new Set(supportItems.map((item) => item.id));
    return sortInboxItemsByAttentionStatus([
      ...workspaceItems.filter(
        (item) => !(item.kind === "task" && supportIds.has(item.id)),
      ),
      ...supportItems,
      ...emailItems,
    ]);
  }, [emailItems, supportItems, workspaceItems]);

  const selectedItemId = useMemo(() => {
    const candidates: InboxListItem[] = [
      ...baseItems,
      ...[...pinnedItems.values()].map((pin) => pin.item),
    ];
    const draftPath = parseEmailDraftPath(pathname);
    if (draftPath) {
      return (
        candidates.find(
          (entry) =>
            entry.kind === "email" &&
            entry.inboxId === draftPath.inboxId &&
            (entry.draftId === draftPath.draftId ||
              entry.messageId === draftPath.draftId),
        )?.id ?? null
      );
    }
    const emailPath = parseEmailMessagePath(pathname);
    if (emailPath) {
      return (
        candidates.find(
          (entry) =>
            entry.kind === "email" &&
            entry.inboxId === emailPath.inboxId &&
            entry.messageId === emailPath.messageId,
        )?.id ?? null
      );
    }
    const slug = getSelectedInboxSlugFromPathname(pathname);
    if (!slug) return null;
    return findInboxItemBySlugOrId(candidates, slug)?.id ?? slug;
  }, [baseItems, pathname, pinnedItems]);

  const items = useInboxSessionList(
    active,
    inboxReady,
    baseItems,
    pinnedItems,
    selectedItemId,
  );

  const notificationsActive = active && isInboxPath(pathname);
  useInboxTriageNotifications(items, notificationsActive);
  useInboxUpdatedNotifications(items, inboxReady, notificationsActive);

  const messages = useMemo(
    (): InboxMessagesSources => ({
      conversations,
      emails: emailItems,
      supportTasks: supportItems,
    }),
    [conversations, emailItems, supportItems],
  );

  const modeItems = useMemo(
    () =>
      listMode === "messages"
        ? buildInboxMessagesModeItems(messages)
        : resolveInboxModeListItems(items, listMode),
    [items, listMode, messages],
  );

  // useChatInbox flips `loading` inside an effect, so the first enabled
  // render still reads idle — track "has loaded once" explicitly.
  const [chatLoadedOnce, setChatLoadedOnce] = useState(false);
  const chatWasLoadingRef = useRef(false);
  useEffect(() => {
    if (chatLoading) {
      chatWasLoadingRef.current = true;
    } else if (chatWasLoadingRef.current) {
      setChatLoadedOnce(true);
    }
  }, [chatLoading]);
  const pending =
    listMode === "messages"
      ? !inboxReady ||
        agentMail.loading ||
        chatLoading ||
        (!chatLoadedOnce && conversations.length === 0)
      : !inboxReady;
  const loading = modeItems.length === 0 && pending;

  const attentionGroupOverrides = useMemo(
    () => buildInboxAttentionGroupOverrides(pinnedItems),
    [pinnedItems],
  );

  const value = useMemo(
    (): InboxModeModel => ({
      listMode,
      setListMode,
      items,
      modeItems,
      messages,
      loading,
      pending,
      ready: inboxReady,
      attentionGroupOverrides,
      chat,
      contactAvatarSrc,
      organizationAvatarSrc,
    }),
    [
      attentionGroupOverrides,
      chat,
      contactAvatarSrc,
      inboxReady,
      items,
      listMode,
      loading,
      messages,
      modeItems,
      organizationAvatarSrc,
      pending,
      setListMode,
    ],
  );

  return (
    <InboxModeModelContext.Provider value={value}>
      {children}
    </InboxModeModelContext.Provider>
  );
}
