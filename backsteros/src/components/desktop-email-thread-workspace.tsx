import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildInboxEmailListItem,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  emailListItemPartyEmail,
  emailListItemPartyName,
  resolveCommunicationEmailParty,
  type CommunicationEmailActiveParty,
  type EmailMessagePartyLink,
  type EmailMessagePartyMap,
  type InboxEmailListItem,
} from "@backsteros/ui";

import {
  DesktopChatContactDetailPanel,
  type ChatContactPanelVisitor,
} from "./desktop-chat-contact-detail-panel";
import { DesktopCommunicationEmailThread } from "./desktop-communication-email-thread";
import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap, withOrganizationAvatarSrc } from "../lib/avatar-src";
import { normalizeContactEmails } from "../lib/contact-row-normalizers";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import {
  EMPTY_COMPOSE_EMAIL_META,
  useCommunicationPropertyHandlers,
  type ComposeEmailMeta,
} from "../screens/communication/use-communication-property-handlers";

type DesktopEmailThreadWorkspaceProps = {
  inboxId: string;
  messageId: string;
  /** Href after delete / spam (inbox, messages, tasks, …). */
  listReturnHref: string;
};

/**
 * Messages-style email reading layout for `/email/…` (Inbox and other
 * list= contexts): centered thread + sticky composer + contact rail.
 */
export function DesktopEmailThreadWorkspace({
  inboxId,
  messageId,
  listReturnHref,
}: DesktopEmailThreadWorkspaceProps) {
  const { client } = useDesktopApi();
  const agentMail = useAgentMail();
  const workspace = useDesktopWorkspaceData();
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [emailActiveParty, setEmailActiveParty] =
    useState<CommunicationEmailActiveParty | null>(null);
  const [emailSelectedParty, setEmailSelectedParty] =
    useState<CommunicationEmailActiveParty | null>(null);
  const [emailMessageParties, setEmailMessageParties] =
    useState<EmailMessagePartyMap>({});
  const [emailThreadReady, setEmailThreadReady] = useState(false);
  const [contactCollapsed, setContactCollapsed] = useState(false);
  const [contactExpanded, setContactExpanded] = useState(false);
  const [mainFaded, setMainFaded] = useState(false);

  // Match Communication: reset thread-local selection when the open list row
  // changes so the previous email/contact rail cannot stick.
  const openEmailKey = `${inboxId}\0${messageId}`;
  const prevOpenEmailKeyRef = useRef(openEmailKey);
  useEffect(() => {
    if (prevOpenEmailKeyRef.current === openEmailKey) return;
    prevOpenEmailKeyRef.current = openEmailKey;
    setSelectedMessageId(null);
    setEmailThreadReady(false);
    setEmailActiveParty(null);
    setEmailSelectedParty(null);
    setEmailMessageParties({});
  }, [openEmailKey]);

  // Compose stubs — email-only workspace never enters compose rail mode.
  const [composeParty, setComposeParty] = useState<EmailMessagePartyLink>({
    contactId: null,
    organizationId: null,
  });
  const [, setComposeEmailMeta] = useState<ComposeEmailMeta>(
    EMPTY_COMPOSE_EMAIL_META,
  );
  const composePartyManualRef = useRef(false);

  const mailboxById = useMemo(() => {
    const map = new Map<
      string,
      (typeof agentMail.mailboxes)[number]
    >();
    for (const mailbox of agentMail.mailboxes) {
      map.set(mailbox.inboxId, mailbox);
    }
    return map;
  }, [agentMail]);

  const selectedEmail = useMemo((): InboxEmailListItem | null => {
    const listEntry = agentMail.messages.find(
      (entry) =>
        entry.inboxId === inboxId &&
        entry.id === messageId &&
        entry.kind !== "draft",
    );
    if (listEntry) {
      const mailbox = mailboxById.get(listEntry.inboxId) ?? null;
      return buildInboxEmailListItem({
        inboxId: listEntry.inboxId,
        messageId: listEntry.id,
        draftId: listEntry.draftId ?? null,
        threadId: listEntry.threadId,
        title: listEntry.subject,
        from: listEntry.from,
        status: listEntry.status,
        inboxUpdatedAt: listEntry.inboxUpdatedAt,
        priority: listEntry.priority,
        dueDate: listEntry.dueDate,
        updatedAt: listEntry.receivedAt,
        assigneeId: listEntry.assigneeId,
        projectId: listEntry.projectId,
        projectKey: listEntry.projectKey,
        projectName: listEntry.projectName,
        organizationId: listEntry.organizationId,
        organizationName: listEntry.organizationName,
        contactId: listEntry.contactId,
        contactName: listEntry.contactName,
        partyContactIds: listEntry.partyContactIds ?? null,
        emailThreadId: listEntry.emailThreadId,
        number: listEntry.number,
        displayId: listEntry.displayId,
        direction: listEntry.direction ?? null,
        mailboxEmail: mailbox?.email ?? null,
        mailboxLabel: mailbox?.displayName || mailbox?.email || null,
        mailboxAvatarSrc: listEntry.contactId
          ? (contactAvatarSrc[listEntry.contactId] ?? null)
          : listEntry.organizationId
            ? (organizationAvatarSrc[listEntry.organizationId] ?? null)
            : null,
        unread: listEntry.unread === true,
      });
    }
    return buildInboxEmailListItem({
      inboxId,
      messageId,
      title: "(no subject)",
      status: "triage",
    });
  }, [
    agentMail.messages,
    contactAvatarSrc,
    inboxId,
    mailboxById,
    messageId,
    organizationAvatarSrc,
  ]);

  const fallbackPartyEmail = selectedEmail
    ? emailListItemPartyEmail(selectedEmail)
    : null;
  const { focusParty, selectedMessageParty, emailPartyEmail } = useMemo(
    () =>
      resolveCommunicationEmailParty({
        isComposing: false,
        composeParty,
        composePartyEmail: null,
        activeParty: emailActiveParty,
        selectedParty: emailSelectedParty,
        messageParties: emailMessageParties,
        fallbackPartyEmail,
        contacts: workspace.contacts,
        organizations: workspace.organizations,
      }),
    [
      composeParty,
      emailActiveParty,
      emailMessageParties,
      emailSelectedParty,
      fallbackPartyEmail,
      workspace.contacts,
      workspace.organizations,
    ],
  );

  const matchedContact = useMemo(() => {
    const id = selectedMessageParty?.contactId?.trim();
    if (!id) return null;
    return workspace.contacts.find((contact) => contact.id === id) ?? null;
  }, [selectedMessageParty?.contactId, workspace.contacts]);

  const matchedOrganization = useMemo(() => {
    const id =
      selectedMessageParty?.organizationId?.trim() ||
      matchedContact?.organizationId?.trim() ||
      null;
    if (!id) return null;
    return workspace.organizations.find((org) => org.id === id) ?? null;
  }, [
    matchedContact?.organizationId,
    selectedMessageParty?.organizationId,
    workspace.organizations,
  ]);

  const polishedPartyName =
    matchedContact?.name?.trim() ||
    matchedOrganization?.name?.trim() ||
    focusParty?.displayName?.trim() ||
    null;

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(workspace.contacts, {
        avatarSrcById: contactAvatarSrc,
      }),
    [contactAvatarSrc, workspace.contacts],
  );
  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(workspace.projects, { includeNone: true }),
    [workspace.projects],
  );
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
        withOrganizationAvatarSrc(
          workspace.organizations,
          organizationAvatarSrc,
        ),
        { includeNone: false },
      ),
    [organizationAvatarSrc, workspace.organizations],
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

  const railHandlers = useCommunicationPropertyHandlers({
    client,
    contacts: workspace.contacts,
    projects: workspace.projects,
    isComposingEmail: false,
    selectedEmail,
    selectedSupport: null,
    selectedChatConversation: null,
    supportRelatedOrganizationIds: [],
    patchTask: () => undefined,
    composeParty,
    composePartyEmail: null,
    composePartyManualRef,
    setComposeParty,
    setComposeEmailMeta,
    ensureContactHasOtherEmail,
    selectedEmailMessageId: selectedMessageId,
    emailActiveParty,
    emailSelectedParty,
    selectedMessageParty,
    emailPartyEmail,
    setEmailMessageParties,
    setEmailActiveParty,
    setEmailSelectedParty,
    setChatStatus: () => undefined,
    patchChatConversation: () => undefined,
  });

  const railEmailActiveParty = useMemo(() => {
    if (!selectedEmail) return null;
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
  }, [
    emailPartyEmail,
    focusParty?.messageId,
    matchedContact?.organizationId,
    polishedPartyName,
    selectedEmail,
    selectedMessageParty?.contactId,
    selectedMessageParty?.organizationId,
  ]);

  const railVisitor = useMemo((): ChatContactPanelVisitor | null => {
    if (!selectedEmail) return null;
    const contactAvatarUrl = matchedContact
      ? (contactAvatarSrc[matchedContact.id] ?? matchedContact.avatarSrc ?? null)
      : matchedOrganization
        ? (organizationAvatarSrc[matchedOrganization.id] ?? null)
        : null;
    return {
      contactName:
        polishedPartyName ||
        emailPartyEmail ||
        emailListItemPartyName(selectedEmail),
      contactEmail: emailPartyEmail,
      contactPhone: null,
      contactAvatarUrl,
    };
  }, [
    contactAvatarSrc,
    emailPartyEmail,
    matchedContact,
    matchedOrganization,
    organizationAvatarSrc,
    polishedPartyName,
    selectedEmail,
  ]);

  const resolveRemovalHref = useCallback(
    (_removedId: string) => listReturnHref,
    [listReturnHref],
  );

  const hideContactPanel = useCallback(() => setContactCollapsed(true), []);
  const showContactPanel = useCallback(() => setContactCollapsed(false), []);

  if (!selectedEmail) return null;

  return (
    <div
      className={[
        "communication-chat-layout",
        "journal-day-layout",
        "desktop-journal-day-layout",
        contactCollapsed ? "is-calendar-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-split
      data-calendar-collapsed={contactCollapsed ? "true" : "false"}
      data-chat-contact-expanded={contactExpanded ? "true" : "false"}
    >
      <div
        className={[
          "journal-day-layout__main",
          mainFaded || contactExpanded ? "is-expand-faded" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="communication-chat communication-chat--thread-only">
          <section className="communication-chat__thread">
            <DesktopCommunicationEmailThread
              item={selectedEmail}
              selectedMessageId={selectedMessageId}
              onSelectMessage={setSelectedMessageId}
              onActivePartyChange={setEmailActiveParty}
              onSelectedPartyChange={setEmailSelectedParty}
              onReadyChange={setEmailThreadReady}
              messageParties={emailMessageParties}
              onMessagePartiesChange={railHandlers.onMessagePartiesChange}
              onAutoLinkParties={railHandlers.onAutoLinkParties}
              resolveRemovalHref={resolveRemovalHref}
            />
          </section>
        </div>
      </div>
      <DesktopChatContactDetailPanel
        open={emailThreadReady}
        contact={matchedContact}
        supportTicket={false}
        emailActiveParty={railEmailActiveParty}
        visitor={railVisitor}
        conversation={null}
        conversations={[]}
        emailItem={selectedEmail}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        contactOptions={contactPickerOptions}
        organizationOptions={organizationPickerOptions}
        onEmailStatusChange={railHandlers.onEmailStatusChange}
        onEmailPriorityChange={railHandlers.onEmailPriorityChange}
        onEmailDueDateChange={railHandlers.onEmailDueDateChange}
        onEmailAssigneeChange={railHandlers.onEmailAssigneeChange}
        onEmailProjectChange={railHandlers.onEmailProjectChange}
        onLinkOrganization={railHandlers.onLinkOrganization}
        onUnlinkOrganization={railHandlers.onUnlinkOrganization}
        onLinkContact={railHandlers.onLinkContact}
        onUnlinkContact={railHandlers.onUnlinkContact}
        collapsed={contactCollapsed}
        onHide={hideContactPanel}
        onShow={showContactPanel}
        onExpandedChange={setContactExpanded}
        onChatMainFadedChange={setMainFaded}
      />
    </div>
  );
}
