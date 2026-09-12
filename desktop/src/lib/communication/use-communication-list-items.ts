import { useMemo } from "react";

import {
  buildInboxEmailListItem,
  buildInboxTaskListItem,
  sortInboxItemsByAttentionStatus,
  type InboxListItem,
} from "@backsteros/ui";

import { agentMailMessagesSignature } from "../agentmail-list-cache";
import { useAgentMail } from "../agentmail-context";
import { useDesktopAvatarSrcMap } from "../avatar-src";
import { buildMailboxByIdMap } from "../email-list-tasks";
import { useKeepAliveFrozen } from "../shell-route-keep-alive";
import {
  useDesktopWorkspacePeople,
  useDesktopWorkspaceTasks,
} from "../workspace-data";

/**
 * Communication list = support tasks + AgentMail messages (inbox-style rows).
 */
export function useCommunicationListItems(): InboxListItem[] {
  const frozen = useKeepAliveFrozen();
  const { allTasks } = useDesktopWorkspaceTasks();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const agentMail = useAgentMail();

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    frozen ? [] : contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    frozen ? [] : organizations,
  );

  const agentMailListSignature = useMemo(
    () => agentMailMessagesSignature(agentMail.messages),
    [agentMail.messages],
  );

  return useMemo(() => {
    if (frozen) return [];

    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const organizationsById = new Map(
      organizations.map((organization) => [organization.id, organization]),
    );

    const supportTasks: InboxListItem[] = allTasks
      .filter((task) => Boolean(task.support))
      .map((task) => {
        const relatedContactId = task.relatedContactIds?.[0] ?? null;
        const relatedOrganizationId =
          task.relatedOrganizationIds?.[0] ?? null;
        const relatedContact = relatedContactId
          ? contactsById.get(relatedContactId)
          : undefined;
        const relatedOrganization = relatedOrganizationId
          ? organizationsById.get(relatedOrganizationId)
          : undefined;

        return buildInboxTaskListItem({
          id: task.id,
          title: task.title,
          number: task.number ?? 0,
          status: task.status,
          priority: task.priority,
          dueDate:
            typeof task.dueDate === "number"
              ? task.dueDate
              : task.dueDate
                ? task.dueDate.getTime()
                : null,
          updatedAt: task.updatedAt ?? Date.now(),
          description: null,
          projectId: task.projectId,
          projectKey: task.projectKey ?? null,
          projectName: task.projectName ?? null,
          assigneeId: task.assigneeId ?? null,
          inbox: task.inbox ?? false,
          agentCreatedAt: task.agentCreatedAt,
          agentInboxApprovedAt: task.agentInboxApprovedAt,
          inboxUpdatedAt: task.inboxUpdatedAt,
          support: true,
          notification: task.notification ?? null,
          organizationName: relatedOrganization?.name ?? null,
          contactName: relatedContact?.name ?? null,
          contactAvatarSrc: relatedContactId
            ? (contactAvatarSrc[relatedContactId] ?? null)
            : null,
        });
      });

    const mailboxById = buildMailboxByIdMap(agentMail.mailboxes);
    const emails: InboxListItem[] = agentMail.messages.map((item) => {
      const mailbox = mailboxById.get(item.inboxId) ?? null;
      return buildInboxEmailListItem({
        inboxId: item.inboxId,
        messageId: item.id,
        draftId: item.kind === "draft" ? item.id : null,
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
        emailThreadId: item.emailThreadId,
        number: item.number,
        displayId: item.displayId,
        mailboxLabel: mailbox?.displayName || mailbox?.email || null,
        mailboxAvatarSrc: item.contactId
          ? (contactAvatarSrc[item.contactId] ?? null)
          : item.organizationId
            ? (organizationAvatarSrc[item.organizationId] ?? null)
            : null,
      });
    });

    return sortInboxItemsByAttentionStatus([...supportTasks, ...emails]);
    // Signature tracks AgentMail message field changes without depending on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    agentMail.mailboxes,
    agentMailListSignature,
    allTasks,
    contactAvatarSrc,
    contacts,
    frozen,
    organizationAvatarSrc,
    organizations,
  ]);
}
