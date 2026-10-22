import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  COMMUNICATION_LIST_FILTER_OPTIONS,
  CommunicationChatView,
  CommunicationOverviewView,
  FinanceSyncIcon,
  TaskDetailView,
  buildAssigneeDropdownOptions,
  buildEmailRelatedPropertyOptions,
  buildInboxTaskListItem,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskDueDatePatch,
  buildTaskRelatedDropdownOptions,
  emailMailboxLabel,
  encodeTaskSlug,
  filterCommunicationListItems,
  findCommunicationItemBySlugOrId,
  getCommunicationChannelHref,
  getInboxItemDisplayId,
  getInboxTaskRouteSlugForTask,
  inboxListItemToTaskItemRowTask,
  parseCommunicationChannelFromSearch,
  parseCommunicationInboxIdFromSearch,
  parseCommunicationStatusFromSearch,
  resolveSupportParties,
  type InboxEmailListItem,
  type InboxListItem,
  type InboxTaskListItem,
  type TaskStatus,
  getTaskStatusLabel,
} from "@backsteros/ui";

import { DesktopChatContactDetailPanel } from "../components/desktop-chat-contact-detail-panel";
import { DesktopTaskActivityPanel } from "../components/desktop-task-activity-panel";
import { DesktopTaskLayout } from "../components/desktop-task-layout";
import { navigateToHref } from "../router/navigate-href";
import { useDesktopApi } from "../lib/api-context";
import {
  deleteEmailMessage,
} from "../lib/delete-email-message";
import {
  prefetchEmailDraftDetail,
  prefetchEmailMessageDetail,
} from "../lib/email-message-detail-cache";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useTaskFileAttachments } from "../lib/use-task-file-attachments";
import { useDesktopAvatarSrcMap, withOrganizationAvatarSrc } from "../lib/avatar-src";
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
import { RouterLink } from "../shell/app-shell-links";

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
  const channel = useMemo(
    () => parseCommunicationChannelFromSearch(location.searchStr),
    [location.searchStr],
  );
  // Keep SSE + unread alive for the whole Communication keep-alive pane, not
  // only while ?channel=chat is focused (Lemo-style background notifications).
  const chatInbox = useChatInbox({
    enabled: keepAliveActive,
    channelFocused: channel === "chat",
  });
  const [chatContactCollapsed, setChatContactCollapsed] = useState(false);
  const [chatContactExpanded, setChatContactExpanded] = useState(false);
  const [chatMainFaded, setChatMainFaded] = useState(false);

  useEffect(() => {
    if (chatInbox.selectedId) {
      setChatContactCollapsed(false);
    } else {
      setChatContactExpanded(false);
      setChatMainFaded(false);
    }
  }, [chatInbox.selectedId]);

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

  const inboxId = useMemo(
    () => parseCommunicationInboxIdFromSearch(location.searchStr),
    [location.searchStr],
  );
  const statusFilter = useMemo(
    () => parseCommunicationStatusFromSearch(location.searchStr),
    [location.searchStr],
  );
  const activeMailbox = useMemo(
    () =>
      inboxId
        ? (agentMail.mailboxes.find((mailbox) => mailbox.inboxId === inboxId) ??
          null)
        : null,
    [agentMail.mailboxes, inboxId],
  );
  const inboxLabel = activeMailbox
    ? activeMailbox.email.trim() || emailMailboxLabel(activeMailbox)
    : null;

  const filteredItems = useMemo(
    () =>
      filterCommunicationListItems(
        communicationItems,
        channel,
        inboxId,
        statusFilter,
      ),
    [channel, communicationItems, inboxId, statusFilter],
  );

  const listLoading =
    (agentMail.messagesLoading || agentMail.loading) &&
    filteredItems.length === 0;

  const statusLabel = statusFilter ? getTaskStatusLabel(statusFilter) : null;
  const channelLabel =
    inboxLabel && statusLabel
      ? `${inboxLabel} · ${statusLabel}`
      : (inboxLabel ??
        COMMUNICATION_LIST_FILTER_OPTIONS.find(
          (option) => option.value === channel,
        )?.label ??
        "Everything");

  const displayId = supportTask ? getInboxItemDisplayId(supportTask) : null;
  // Refresh in the chrome title row — Chat (Moneybird-style sync icon) or Email
  // mailbox. Not Everything / Support (those have no remote inbox to pull).
  const showChatRefresh = channel === "chat";
  const showEmailBoxRefresh = channel === "email" || Boolean(inboxId);
  const messagesBusy = agentMail.messagesLoading || agentMail.loading;
  const chatBusy = chatInbox.loading;
  const breadcrumbItems = useMemo(
    () =>
      supportTask
        ? [
            {
              label: channelLabel,
              href: getCommunicationChannelHref(channel, {
                inboxId,
                status: statusFilter,
              }),
            },
            {
              label: displayId
                ? `${displayId} ${supportTask.title}`
                : supportTask.title,
            },
          ]
        : [{ label: channelLabel }],
    [
      channel,
      channelLabel,
      displayId,
      inboxId,
      statusFilter,
      supportTask,
    ],
  );
  // Must be referentially stable — useRegisterChromeHeader setStates on every
  // new header node, and inline JSX here caused an infinite update loop (ANR).
  const reloadMail = agentMail.reload;
  const reloadChat = chatInbox.refresh;
  const breadcrumbActions = useMemo(() => {
    if (showChatRefresh) {
      return (
        <div className="catalog-chrome-actions">
          <button
            type="button"
            className="catalog-chrome-actions__icon-button"
            aria-label="Refresh chats"
            title="Refresh chats"
            disabled={chatBusy}
            onClick={() => {
              reloadChat();
            }}
          >
            <FinanceSyncIcon
              size={14}
              className={
                chatBusy
                  ? "catalog-chrome-actions__sync-icon is-spinning"
                  : "catalog-chrome-actions__sync-icon"
              }
            />
          </button>
        </div>
      );
    }
    if (showEmailBoxRefresh) {
      return (
        <div className="catalog-chrome-actions">
          <button
            type="button"
            className="catalog-chrome-actions__icon-button"
            aria-label="Refresh mailbox"
            title="Refresh mailbox"
            disabled={messagesBusy}
            onClick={() => {
              void reloadMail();
            }}
          >
            <FinanceSyncIcon
              size={14}
              className={
                messagesBusy
                  ? "catalog-chrome-actions__sync-icon is-spinning"
                  : "catalog-chrome-actions__sync-icon"
              }
            />
          </button>
        </div>
      );
    }
    return null;
  }, [
    chatBusy,
    messagesBusy,
    reloadChat,
    reloadMail,
    showChatRefresh,
    showEmailBoxRefresh,
  ]);
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

  const findListItemTaskRow = useCallback(
    (itemId: string) => {
      const item = communicationItems.find((entry) => entry.id === itemId);
      return item ? inboxListItemToTaskItemRowTask(item) : null;
    },
    [communicationItems],
  );

  const handleStatusChange = useCallback(
    (itemId: string, status: TaskStatus) => {
      const task = findListItemTaskRow(itemId);
      if (task?.listKind === "email") {
        void patchEmailTaskListItem(client, task, { status });
        return;
      }
      void workspace.patchTask(itemId, { status });
    },
    [client, findListItemTaskRow, workspace],
  );

  const handlePriorityChange = useCallback(
    (itemId: string, priority: number) => {
      const task = findListItemTaskRow(itemId);
      if (task?.listKind === "email") {
        void patchEmailTaskListItem(client, task, { priority });
        return;
      }
      void workspace.patchTask(itemId, { priority });
    },
    [client, findListItemTaskRow, workspace],
  );

  const handleDueDateChange = useCallback(
    (itemId: string, dueDate: Date | null) => {
      const task = findListItemTaskRow(itemId);
      if (task?.listKind === "email") {
        void patchEmailTaskListItem(client, task, {
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
        return;
      }
      void workspace.patchTask(itemId, buildTaskDueDatePatch(dueDate));
    },
    [client, findListItemTaskRow, workspace],
  );

  const handleProjectChange = useCallback(
    (itemId: string, projectKey: string | null) => {
      const project = projectKey
        ? (workspace.projects.find((entry) => entry.key === projectKey) ?? null)
        : null;
      const task = findListItemTaskRow(itemId);
      if (task?.listKind === "email") {
        void patchEmailTaskListItem(
          client,
          task,
          { projectId: project?.id ?? null },
          {
            projectName: project?.name ?? null,
            projectKey: project?.key ?? null,
          },
        );
        return;
      }
      void workspace.patchTask(itemId, {
        projectId: project?.id ?? null,
        projectKey: project?.key ?? null,
      });
    },
    [client, findListItemTaskRow, workspace],
  );

  const handleDeleteEmail = useCallback(
    async (item: InboxEmailListItem) =>
      deleteEmailMessage(client, {
        inboxId: item.inboxId,
        messageId: item.messageId,
        threadId: item.threadId,
      }),
    [client],
  );

  const handleHighlightChange = useCallback(
    (item: InboxListItem | null) => {
      if (!item || item.kind !== "email") return;
      if (item.draftId?.trim()) {
        prefetchEmailDraftDetail(client, item.inboxId, item.draftId);
        return;
      }
      prefetchEmailMessageDetail(client, item.inboxId, item.messageId);
    },
    [client],
  );

  if (location.pathname.startsWith("/email/")) {
    return null;
  }

  if (channel === "chat") {
    const selectedConversation =
      chatInbox.conversations.find(
        (row) => row.id === chatInbox.selectedId,
      ) ?? chatInbox.detail;
    const matchedContact = selectedConversation
      ? matchChatContact(workspace.contacts, {
          contactEmail:
            chatInbox.detail?.contactEmail ??
            selectedConversation.contactEmail,
          contactPhone:
            chatInbox.detail?.contactPhone ??
            selectedConversation.contactPhone,
        })
      : null;
    const chatContactPanelOpen = Boolean(chatInbox.selectedId);

    return (
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
            selectedId={chatInbox.selectedId}
            detail={chatInbox.detail}
            loading={chatInbox.loading}
            detailLoading={chatInbox.detailLoading}
            error={chatInbox.error}
            typingIds={chatInbox.typingIds}
            onTypingChange={chatInbox.setTyping}
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
            onSelect={chatInbox.selectConversation}
            onSend={chatInbox.sendMessage}
          />
        </div>
        <DesktopChatContactDetailPanel
          open={chatContactPanelOpen}
          contact={matchedContact}
          visitor={
            selectedConversation
              ? {
                  contactName: selectedConversation.contactName,
                  contactEmail: selectedConversation.contactEmail,
                  contactPhone: selectedConversation.contactPhone,
                  contactAvatarUrl: selectedConversation.contactAvatarUrl,
                }
              : null
          }
          conversation={
            chatInbox.detail?.id === chatInbox.selectedId
              ? chatInbox.detail
              : (selectedConversation ?? null)
          }
          conversations={chatInbox.conversations}
          statusUpdating={chatInbox.sending}
          propertiesUpdating={chatInbox.sending}
          assigneeOptions={assigneeOptions}
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
          onSelectConversation={chatInbox.selectConversation}
          collapsed={chatContactCollapsed}
          onHide={() => setChatContactCollapsed(true)}
          onShow={() => setChatContactCollapsed(false)}
          onExpandedChange={setChatContactExpanded}
          onChatMainFadedChange={setChatMainFaded}
        />
      </div>
    );
  }

  if (!supportTask) {
    return (
      <CommunicationOverviewView
        items={filteredItems}
        channel={channel}
        title={channelLabel}
        inboxLabel={inboxLabel}
        inboxId={inboxId}
        status={statusFilter}
        Link={RouterLink}
        loading={listLoading}
        listKeyboardEnabled={keepAliveActive}
        onNavigate={(href) => navigateToHref(navigate, href)}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
        onDueDateChange={handleDueDateChange}
        onProjectChange={handleProjectChange}
        onDeleteEmail={handleDeleteEmail}
        onHighlightChange={handleHighlightChange}
      />
    );
  }

  return (
    <DesktopTaskLayout
      key={`communication-task-layout-${supportTask.id}`}
      taskId={supportTask.id}
    >
      <TaskDetailView
        sectionLabel="Communication"
        copyIdShortcutEnabled={keepAliveActive}
        task={{
          id: supportTask.id,
          title: supportTask.title,
          status: selectedTaskRecord?.status ?? supportTask.status,
          priority: selectedTaskRecord?.priority ?? supportTask.priority,
          dueDate: selectedTaskRecord?.dueDate ?? supportTask.dueDate ?? null,
          assigneeId: selectedTaskRecord?.assigneeId ?? supportTask.assigneeId,
          assigneeName: assignee?.name ?? null,
          contactId: selectedTaskRecord?.contactId ?? null,
          relatedContactIds: selectedTaskRecord?.relatedContactIds ?? [],
          relatedOrganizationIds:
            selectedTaskRecord?.relatedOrganizationIds ?? [],
          linkedEmailIds: selectedTaskRecord?.linkedEmailIds ?? [],
          projectKey: supportTask.projectKey,
          projectName: supportTask.projectName,
          agentCreatedAt:
            selectedTaskRecord?.agentCreatedAt ??
            supportTask.agentCreatedAt ??
            null,
          agentInboxApprovedAt:
            selectedTaskRecord?.agentInboxApprovedAt ??
            supportTask.agentInboxApprovedAt ??
            null,
          trackedMinutes: selectedTaskRecord?.trackedMinutes ?? null,
          trackedDurationSeconds:
            selectedTaskRecord?.trackedDurationSeconds ?? null,
          support: selectedTaskRecord?.support ?? supportTask.support ?? false,
          description: fetchedDescription,
          links: parseTaskLinks(
            workspace.taskDetails[supportTask.id]?.links,
          ),
          displayId: getInboxItemDisplayId(supportTask),
        }}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        relatedOptions={relatedOptions}
        supportContact={supportParties.contact}
        supportOrganization={supportParties.organization}
        supportContactHref={supportParties.contactHref}
        supportOrganizationHref={supportParties.organizationHref}
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
        onAssigneeChange={(next) => patchTask({ assigneeId: next })}
        onRelatedChange={(related) =>
          patchTask({
            relatedContactIds: related.contactIds,
            relatedOrganizationIds: related.organizationIds,
            linkedEmailIds: related.emailIds,
          })
        }
        onLabelChange={(labelIds) => patchTask({ labelIds })}
        labelOptions={labelOptions}
        onProjectChange={(projectKey) => patchTask({ projectKey })}
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
          entityId: supportTask.id,
          title: supportTask.title,
          subtitle: getInboxItemDisplayId(supportTask),
          statusKey: selectedTaskRecord?.status ?? supportTask.status,
          href: location.pathname,
        }}
        belowDescription={
          <DesktopTaskActivityPanel
            taskId={supportTask.id}
            taskUpdatedAt={selectedTaskRecord?.updatedAt ?? null}
            contacts={workspace.contacts}
            contactAvatarSrc={contactAvatarSrc}
            patchTaskValues={async (values) => {
              await workspace.patchTask(supportTask.id, values);
            }}
            activityFeedBump={activityFeedBump}
            commentResolveMode="ticket"
            resolveImageSrc={resolveImageSrc}
            onUploadImages={onUploadImages}
            taskSummary={{
              number: supportTask.number ?? 0,
              title: supportTask.title,
              description: fetchedDescription || null,
              status: selectedTaskRecord?.status ?? supportTask.status,
              projectKey: supportTask.projectKey,
              projectId: selectedTaskRecord?.projectId ?? null,
              projectName: supportTask.projectName ?? null,
              displayId: getInboxItemDisplayId(supportTask),
              agentWorkingContactId:
                selectedTaskRecord?.agentWorkingContactId ?? null,
              agentWorkingContactName:
                selectedTaskRecord?.agentWorkingContactName ?? null,
              agentWorkingKind: selectedTaskRecord?.agentWorkingKind ?? null,
            }}
          />
        }
      />
    </DesktopTaskLayout>
  );
}
