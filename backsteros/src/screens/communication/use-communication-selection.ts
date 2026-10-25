import { useEffect, useMemo, useState } from "react";
import type { BacksterosApiClient } from "@backsteros/api-client";
import type { ChatConversation } from "@backsteros/contracts";
import {
  buildInboxTaskListItem,
  encodeTaskSlug,
  findCommunicationItemBySlugOrId,
  getInboxTaskRouteSlugForTask,
  type InboxEmailListItem,
  type InboxListItem,
  type InboxTaskListItem,
} from "@backsteros/ui";

import {
  prefetchEmailDraftDetail,
  prefetchEmailMessageDetail,
} from "../../lib/email-message-detail-cache";
import type { DesktopWorkspaceData } from "../../lib/workspace/workspace-data-types";

type WorkspaceTask = DesktopWorkspaceData["allTasks"][number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function findSupportTask(
  communicationItems: readonly InboxListItem[],
  routeItemId: string,
  allTasks: readonly WorkspaceTask[],
): InboxTaskListItem | null {
  const fromList = findCommunicationItemBySlugOrId(
    communicationItems,
    routeItemId,
  );
  if (fromList?.kind === "task") return fromList;

  const normalized = routeItemId.trim().toLowerCase();
  const full = allTasks.find((task) => {
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
}

/**
 * Which Communication row is open (route + optimistic click), resolved into
 * chat / email / support, plus the memoized email and support list slices.
 * Also drives the chat inbox selection and prefetches the opened email.
 */
export function useCommunicationSelection(input: {
  routeItemId: string | undefined;
  communicationItems: readonly InboxListItem[];
  conversations: readonly ChatConversation[];
  chatLoading: boolean;
  chatSelectedId: string | null;
  selectConversation: (conversationId: string | null) => void;
  client: BacksterosApiClient;
  allTasks: readonly WorkspaceTask[];
}) {
  const {
    routeItemId,
    communicationItems,
    conversations,
    chatLoading,
    chatSelectedId,
    selectConversation,
    client,
    allTasks,
  } = input;

  /** Instant highlight while the router catches up to `/communication/:id`. */
  const [optimisticChatItemId, setOptimisticChatItemId] = useState<
    string | null
  >(null);
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

  const chatEmails = useMemo(
    () =>
      communicationItems.filter(
        (entry): entry is InboxEmailListItem => entry.kind === "email",
      ),
    [communicationItems],
  );
  const chatSupportTasks = useMemo(
    () =>
      communicationItems.filter(
        (entry): entry is InboxTaskListItem =>
          entry.kind === "task" && Boolean(entry.support),
      ),
    [communicationItems],
  );

  const selectedChatListItem = useMemo(() => {
    if (!chatItemId) return null;
    if (conversations.some((row) => row.id === chatItemId)) return null;
    return findCommunicationItemBySlugOrId(communicationItems, chatItemId);
  }, [chatItemId, conversations, communicationItems]);

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

  // Chat conversation ids are UUIDs. Support/email routes use slugs like
  // `sup-12` or `email:…` — never treat those as chat (avoids a 404 flash
  // while the unified list is still hydrating).
  const selectedChatConversationId = useMemo(() => {
    if (!chatItemId || selectedEmailId || selectedSupportId) return null;
    if (conversations.some((row) => row.id === chatItemId)) return chatItemId;
    return UUID_PATTERN.test(chatItemId) ? chatItemId : null;
  }, [chatItemId, conversations, selectedEmailId, selectedSupportId]);

  // Drive the chat inbox from the URL (and optimistic click) selection.
  useEffect(() => {
    if (selectedEmailId) {
      if (chatSelectedId != null) selectConversation(null);
      const emailItem = chatEmails.find((entry) => entry.id === selectedEmailId);
      if (emailItem) {
        if (emailItem.draftId?.trim()) {
          prefetchEmailDraftDetail(client, emailItem.inboxId, emailItem.draftId);
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
      if (chatSelectedId != null) selectConversation(null);
      return;
    }
    if (selectedChatConversationId) {
      const inList = conversations.some(
        (row) => row.id === selectedChatConversationId,
      );
      // Wait for the chat list before probing unknown UUIDs — support tasks
      // without a number also use UUIDs in the URL and would 404 as chat.
      if (!inList && chatLoading) return;
      if (
        !inList &&
        findCommunicationItemBySlugOrId(
          communicationItems,
          selectedChatConversationId,
        )
      ) {
        return;
      }
      if (chatSelectedId !== selectedChatConversationId) {
        selectConversation(selectedChatConversationId);
      }
      return;
    }
    if (chatSelectedId != null) selectConversation(null);
  }, [
    chatEmails,
    chatLoading,
    chatSelectedId,
    client,
    communicationItems,
    conversations,
    selectConversation,
    selectedChatConversationId,
    selectedEmailId,
    selectedSupportId,
  ]);

  const supportTask = useMemo(
    () =>
      routeItemId
        ? findSupportTask(communicationItems, routeItemId, allTasks)
        : null,
    [allTasks, communicationItems, routeItemId],
  );

  const selectedTaskRecord = useMemo(
    () =>
      supportTask
        ? (allTasks.find((task) => task.id === supportTask.id) ?? null)
        : null,
    [allTasks, supportTask],
  );

  const selectedEmail = useMemo(
    () =>
      selectedEmailId == null
        ? null
        : (chatEmails.find((entry) => entry.id === selectedEmailId) ?? null),
    [chatEmails, selectedEmailId],
  );
  const selectedSupport = useMemo(
    () =>
      selectedSupportId == null
        ? null
        : (chatSupportTasks.find((entry) => entry.id === selectedSupportId) ??
          supportTask),
    [chatSupportTasks, selectedSupportId, supportTask],
  );

  return {
    optimisticChatItemId,
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
    selectedEmailIsDraft: Boolean(selectedEmail?.draftId?.trim()),
  };
}
