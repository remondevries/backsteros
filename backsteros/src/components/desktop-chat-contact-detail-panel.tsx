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
  coerceContactLanguages,
  getContactEmailAddresses,
  taskInvolvesContact,
  type ChatConversation,
} from "@backsteros/contracts";

import {
  ChatConversationDetailsView,
  CONTACT_DETAIL_EXPAND_FADE_MS,
  ContactDetailOverlay,
  ContactDetailView,
  ContactEmailsListView,
  ContactMeetingsListView,
  ContactPersonIcon,
  ContactRelationshipsListView,
  ContactTasksListView,
  CrmActivityFeedView,
  DROPDOWN_NONE_VALUE,
  EmailConversationDetailsView,
  getCalendarMeetingHref,
  getContactOverlayHref,
  getCreateEntityFromQueryLabel,
  getEmailComposeHref,
  getEmailDetailHref,
  getUniqueListItemRouteParam,
  isHabitLinkedTask,
  normalizeContactSocialAccounts,
  previousChatConversations,
  requestOpenComposeModal,
  resolveChatContactCardSections,
  resolveCommunicationEmailCardSections,
  resolveDropdownNone,
  resolveLetterDetailHref,
  resolveOrganizationAvatarSrc,
  ScopedLettersListView,
  SearchableDropdown,
  SocialContactDetailView,
  taskReorderPatches,
  type ChatConversationStatus,
  type ContactExpandedWorkspaceTabId,
  type ContactListItem,
  type ContactOverlayLayout,
  type ContactOverviewDetails,
  type ContactSectionId,
  type InboxEmailListItem,
  type SearchableDropdownOption,
  type TaskStatus,
} from "@backsteros/ui";

import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { getBrandfetchClientId } from "../lib/brandfetch";
import {
  normalizeContactEmails,
  normalizeContactPhones,
} from "../lib/contact-row-normalizers";
import {
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../lib/email-compose-session";
import {
  useContactRelationships,
  useCrmActivityFeed,
  useCrmGroupsForSubject,
  useCrmRelationshipLabels,
} from "../lib/use-crm-data";
import { navigateToHref } from "../router/navigate-href";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { DesktopCommunicationEmailPartyCard } from "./desktop-communication-email-party-card";

export type ChatContactPanelVisitor = {
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactAvatarUrl?: string | null;
};

type DesktopChatContactDetailPanelProps = {
  open: boolean;
  contact: ContactListItem | null;
  visitor: ChatContactPanelVisitor | null;
  conversation: ChatConversation | null;
  conversations: readonly ChatConversation[];
  /** When set, Details tab shows email properties instead of chat. */
  emailItem?: InboxEmailListItem | null;
  /**
   * Active message party in the Communication Chat thread (per-message
   * org/contact). Overrides thread-level ids for the party card.
   */
  emailActiveParty?: {
    messageId: string | null;
    contactId: string | null;
    organizationId: string | null;
    partyEmail: string | null;
    partyName: string | null;
  } | null;
  statusUpdating?: boolean;
  propertiesUpdating?: boolean;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  organizationOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (status: ChatConversationStatus) => void | Promise<void>;
  onAssigneeChange?: (assigneeId: string | null) => void | Promise<void>;
  onPriorityChange?: (priority: number) => void | Promise<void>;
  onDueDateChange?: (dueDate: Date | null) => void | Promise<void>;
  onEmailStatusChange?: (status: TaskStatus) => void | Promise<void>;
  onEmailAssigneeChange?: (assigneeId: string | null) => void | Promise<void>;
  onEmailPriorityChange?: (priority: number) => void | Promise<void>;
  onEmailDueDateChange?: (dueDate: Date | null) => void | Promise<void>;
  onEmailProjectChange?: (projectKey: string | null) => void | Promise<void>;
  /** Link / select an existing contact for the unmatched chat or email party. */
  onLinkContact?: (contactId: string) => void | Promise<void>;
  /** Link an organization on the selected email thread (org-first party card). */
  onLinkOrganization?: (organizationId: string) => void | Promise<void>;
  onSelectConversation?: (conversationId: string) => void;
  collapsed: boolean;
  onHide: () => void;
  onShow: () => void;
  /** True while the contact workspace overlays the chat (expanded page layout). */
  onExpandedChange?: (expanded: boolean) => void;
  /** Fade the chat main pane during expand/collapse (Contacts list fade parity). */
  onChatMainFadedChange?: (faded: boolean) => void;
};

/**
 * Right-hand contact rail for Communication → Chat — same ContactDetailOverlay
 * + ContactDetailView chrome as Contacts when a conversation’s visitor matches
 * a BacksterOS contact (email/phone). First tab is conversation Details.
 * Expand opens Meetings/Emails/Tasks/Letters over the chat; collapse restores it.
 */
export function DesktopChatContactDetailPanel({
  open,
  contact,
  visitor,
  conversation,
  conversations,
  emailItem = null,
  emailActiveParty = null,
  statusUpdating = false,
  propertiesUpdating = false,
  assigneeOptions = [],
  projectOptions = [],
  contactOptions = [],
  organizationOptions = [],
  onStatusChange,
  onAssigneeChange,
  onPriorityChange,
  onDueDateChange,
  onEmailStatusChange,
  onEmailAssigneeChange,
  onEmailPriorityChange,
  onEmailDueDateChange,
  onEmailProjectChange,
  onLinkContact,
  onLinkOrganization,
  onSelectConversation,
  collapsed,
  onHide,
  onShow,
  onExpandedChange,
  onChatMainFadedChange,
}: DesktopChatContactDetailPanelProps) {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const agentMail = useAgentMail();
  const workspace = useDesktopWorkspaceData();
  const [section, setSection] = useState<ContactSectionId>("conversation");
  const [overlayLayout, setOverlayLayout] =
    useState<ContactOverlayLayout>("panel");
  const [workspaceTab, setWorkspaceTab] =
    useState<ContactExpandedWorkspaceTabId>("meetings");
  const [workspaceFaded, setWorkspaceFaded] = useState(false);
  const [linkingContact, setLinkingContact] = useState(false);
  const setChatFaded = useCallback(
    (faded: boolean) => {
      onChatMainFadedChange?.(faded);
    },
    [onChatMainFadedChange],
  );
  const expandAnimTokenRef = useRef(0);
  const expandAnimTimerRef = useRef<number | null>(null);
  const pendingWorkspaceFadeInRef = useRef(false);
  const pendingChatFadeInRef = useRef(false);

  const contactId = contact?.id ?? null;
  const details = contactId
    ? (workspace.contactDetails[contactId] ?? null)
    : null;

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );

  useEffect(() => {
    setSection("conversation");
    setOverlayLayout("panel");
    setWorkspaceTab("meetings");
    setWorkspaceFaded(false);
    setChatFaded(false);
    setLinkingContact(false);
  }, [contactId, conversation?.id, emailItem?.id, setChatFaded]);

  useEffect(() => {
    onExpandedChange?.(overlayLayout === "page");
  }, [onExpandedChange, overlayLayout]);

  useEffect(() => {
    return () => {
      if (expandAnimTimerRef.current != null) {
        window.clearTimeout(expandAnimTimerRef.current);
      }
    };
  }, []);

  const contactTasks = useMemo(() => {
    if (!contactId) return [];
    return workspace.allTasks.filter(
      (task) =>
        !isHabitLinkedTask(task) && taskInvolvesContact(task, contactId),
    );
  }, [contactId, workspace.allTasks]);

  const contactLetters = useMemo(() => {
    if (!contactId) return [];
    return workspace.letters.filter((letter) => {
      if (letter.contactId === contactId) return true;
      const record = workspace.letterRecords[letter.id];
      return record?.contactId === contactId;
    });
  }, [contactId, workspace.letterRecords, workspace.letters]);

  const expandOverlay = useCallback(() => {
    if (!contact || overlayLayout === "page") return;
    onShow();
    const token = ++expandAnimTokenRef.current;
    pendingChatFadeInRef.current = false;
    pendingWorkspaceFadeInRef.current = true;
    setChatFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setWorkspaceFaded(true);
      setOverlayLayout("page");
    }, CONTACT_DETAIL_EXPAND_FADE_MS);
  }, [contact, onShow, overlayLayout]);

  const collapseOverlay = useCallback(() => {
    onShow();
    if (overlayLayout !== "page") return;
    const token = ++expandAnimTokenRef.current;
    pendingWorkspaceFadeInRef.current = false;
    pendingChatFadeInRef.current = true;
    setWorkspaceFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setChatFaded(true);
      setOverlayLayout("panel");
    }, CONTACT_DETAIL_EXPAND_FADE_MS);
  }, [onShow, overlayLayout]);

  useLayoutEffect(() => {
    if (overlayLayout !== "page") return;
    if (!pendingWorkspaceFadeInRef.current) {
      setChatFaded(true);
      return;
    }
    pendingWorkspaceFadeInRef.current = false;
    setWorkspaceFaded(true);
    setChatFaded(true);
    const token = expandAnimTokenRef.current;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (expandAnimTokenRef.current !== token) return;
        setWorkspaceFaded(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [overlayLayout]);

  useLayoutEffect(() => {
    if (overlayLayout !== "panel") return;
    if (!pendingChatFadeInRef.current) {
      setChatFaded(false);
      setWorkspaceFaded(false);
      return;
    }
    pendingChatFadeInRef.current = false;
    setChatFaded(true);
    setWorkspaceFaded(false);
    const token = expandAnimTokenRef.current;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (expandAnimTokenRef.current !== token) return;
        setChatFaded(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [overlayLayout]);

  const previousConversations = useMemo(() => {
    if (!conversation) return [];
    return previousChatConversations(conversations, conversation);
  }, [conversation, conversations]);

  const conversationDetails = emailItem ? (
    <EmailConversationDetailsView
      item={emailItem}
      assigneeOptions={assigneeOptions}
      projectOptions={projectOptions}
      onStatusChange={onEmailStatusChange}
      onAssigneeChange={onEmailAssigneeChange}
      onPriorityChange={onEmailPriorityChange}
      onDueDateChange={onEmailDueDateChange}
      onProjectChange={onEmailProjectChange}
    />
  ) : conversation ? (
    <ChatConversationDetailsView
      conversation={conversation}
      previousConversations={previousConversations}
      statusUpdating={statusUpdating}
      propertiesUpdating={propertiesUpdating}
      assigneeOptions={assigneeOptions}
      onStatusChange={onStatusChange}
      onAssigneeChange={onAssigneeChange}
      onPriorityChange={onPriorityChange}
      onDueDateChange={onDueDateChange}
      onSelectConversation={onSelectConversation}
    />
  ) : (
    <div className="communication-chat-contact-empty">
      <p className="communication-chat-contact-empty__hint">
        Select a conversation to see chat details.
      </p>
    </div>
  );

  const activityFeed = useCrmActivityFeed(
    "contact",
    contactId,
    open && Boolean(contactId) && section === "overview",
  );
  const relationships = useContactRelationships(
    contactId,
    open && Boolean(contactId) && section === "details",
  );
  const relationshipLabels = useCrmRelationshipLabels(
    open && Boolean(contactId) && section === "details",
  );
  const crmGroups = useCrmGroupsForSubject(
    "contact",
    contactId,
    open && Boolean(contactId),
  );

  const groupOptions = useMemo(
    () =>
      crmGroups.allGroups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
      })),
    [crmGroups.allGroups],
  );
  const memberGroupIds = useMemo(
    () => crmGroups.memberGroups.map((group) => group.id),
    [crmGroups.memberGroups],
  );
  const appliedMemberGroupIdsRef = useRef(memberGroupIds);
  useEffect(() => {
    appliedMemberGroupIdsRef.current = memberGroupIds;
  }, [memberGroupIds]);
  const membershipSyncChainRef = useRef(Promise.resolve());

  const showPortalTab = useMemo(
    () =>
      groupOptions.some(
        (group) =>
          group.name.trim().toLowerCase() === "clients" &&
          memberGroupIds.includes(group.id),
      ),
    [groupOptions, memberGroupIds],
  );

  // Org/contact for email is always the focused message party (or the matched
  // contact’s own org) — never emailItem.contactId/organizationId.
  const emailOrganizationId =
    emailActiveParty?.organizationId?.trim() ||
    contact?.organizationId?.trim() ||
    details?.organizationId?.trim() ||
    null;
  const emailPartyLinked = Boolean(
    emailItem &&
      (emailOrganizationId ||
        emailActiveParty?.contactId?.trim() ||
        contactId),
  );

  const sections = useMemo(() => {
    if (emailItem) {
      return resolveCommunicationEmailCardSections({
        linked: emailPartyLinked,
        showPortal: showPortalTab,
        showPortalLogs: false,
      });
    }
    return resolveChatContactCardSections({
      showPortal: showPortalTab,
      showPortalLogs: false,
    });
  }, [emailItem, emailPartyLinked, showPortalTab]);

  useEffect(() => {
    if (sections.some((entry) => entry.id === section)) return;
    setSection("conversation");
  }, [section, sections]);

  const contactOrganizationOptions = useMemo(
    () =>
      workspace.organizations.map((org) => ({
        id: org.id,
        name: org.name,
        number: org.number,
        key: org.key,
        avatarSrc: organizationAvatarSrc[org.id] ?? null,
      })),
    [organizationAvatarSrc, workspace.organizations],
  );

  const handleMemberGroupIdsChange = useCallback(
    (nextIds: string[]) => {
      const previous = new Set(appliedMemberGroupIdsRef.current);
      const next = new Set(nextIds);
      appliedMemberGroupIdsRef.current = nextIds;
      membershipSyncChainRef.current = membershipSyncChainRef.current
        .catch(() => {})
        .then(async () => {
          try {
            for (const groupId of next) {
              if (!previous.has(groupId)) {
                await crmGroups.toggleMembership(groupId, true);
              }
            }
            for (const groupId of previous) {
              if (!next.has(groupId)) {
                await crmGroups.toggleMembership(groupId, false);
              }
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Failed to update groups";
            window.alert(message);
            await crmGroups.reload();
          }
        });
    },
    [crmGroups],
  );

  const visitorName =
    visitor?.contactName?.trim() ||
    visitor?.contactEmail?.trim() ||
    visitor?.contactPhone?.trim() ||
    (emailItem ? "Email party" : "Visitor");
  const title = contact?.name?.trim() || visitorName;

  const avatarSrc = contactId
    ? (contactAvatarSrc[contactId] ?? contact?.avatarSrc ?? null)
    : (visitor?.contactAvatarUrl?.trim() || null);

  const openFullContact = useCallback(() => {
    if (!contact) return;
    const slug = getUniqueListItemRouteParam(contact, workspace.contacts);
    navigate(getContactOverlayHref(slug));
  }, [contact, navigate, workspace.contacts]);

  const pickerOptions = useMemo(
    () =>
      contactOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    [contactOptions],
  );

  const linkExistingContact = useCallback(
    async (nextContactId: string) => {
      if (!nextContactId) return;
      setLinkingContact(true);
      try {
        if (emailItem && onLinkContact) {
          await onLinkContact(nextContactId);
          return;
        }
        if (onLinkContact) {
          await onLinkContact(nextContactId);
          return;
        }
        // Chat fallback: attach visitor email/phone so matchChatContact resolves.
        const email = visitor?.contactEmail?.trim() || null;
        const phone = visitor?.contactPhone?.trim() || null;
        const target =
          workspace.contacts.find((entry) => entry.id === nextContactId) ??
          null;
        if (!target) return;
        const existingEmails = normalizeContactEmails(
          workspace.contactDetails[nextContactId]?.emails ?? target.emails,
        );
        const patch: Record<string, unknown> = {};
        if (email) {
          const already = existingEmails.some(
            (entry) =>
              entry.address.trim().toLowerCase() === email.toLowerCase(),
          );
          if (!already) {
            patch.emails = [
              ...existingEmails,
              { label: "other" as const, address: email },
            ];
          }
          if (!target.email?.trim()) patch.email = email;
        }
        if (phone && !target.phone?.trim()) {
          patch.phone = phone;
        }
        if (Object.keys(patch).length > 0) {
          await workspace.patchContact(nextContactId, patch);
        }
      } catch (error) {
        console.warn("[desktop] link communication contact failed", error);
      } finally {
        setLinkingContact(false);
      }
    },
    [
      emailItem,
      onLinkContact,
      visitor?.contactEmail,
      visitor?.contactPhone,
      workspace,
    ],
  );

  const createAndLinkContact = useCallback(
    async (query?: string) => {
      setLinkingContact(true);
      try {
        const fromQuery = query?.trim() || "";
        const nameParts = (
          fromQuery ||
          visitor?.contactName?.trim() ||
          ""
        ).split(/\s+/);
        const created = await workspace.createContact({
          firstName:
            nameParts[0] ||
            (emailItem ? "Email" : "Chat"),
          lastName:
            nameParts.slice(1).join(" ") ||
            (emailItem ? "party" : "visitor"),
          email: visitor?.contactEmail?.trim() || null,
          ...(emailOrganizationId
            ? { organizationId: emailOrganizationId }
            : {}),
        });
        const phone = visitor?.contactPhone?.trim();
        if (phone) {
          await workspace.patchContact(created.id, { phone });
        }
        if (onLinkContact) {
          await onLinkContact(created.id);
        }
      } catch (error) {
        console.warn("[desktop] create communication contact failed", error);
      } finally {
        setLinkingContact(false);
      }
    },
    [
      emailItem,
      emailOrganizationId,
      onLinkContact,
      visitor?.contactEmail,
      visitor?.contactName,
      visitor?.contactPhone,
      workspace,
    ],
  );

  const linkExistingOrganization = useCallback(
    async (nextOrganizationId: string) => {
      if (!nextOrganizationId || !onLinkOrganization) return;
      setLinkingContact(true);
      try {
        await onLinkOrganization(nextOrganizationId);
      } catch (error) {
        console.warn("[desktop] link communication organization failed", error);
      } finally {
        setLinkingContact(false);
      }
    },
    [onLinkOrganization],
  );

  const createAndLinkOrganization = useCallback(
    async (query?: string) => {
      if (!onLinkOrganization) return;
      setLinkingContact(true);
      try {
        const name = query?.trim() || visitor?.contactName?.trim() || "Organization";
        const created = await workspace.createOrganization({ name });
        await onLinkOrganization(created.id);
      } catch (error) {
        console.warn(
          "[desktop] create communication organization failed",
          error,
        );
      } finally {
        setLinkingContact(false);
      }
    },
    [onLinkOrganization, visitor?.contactName, workspace],
  );

  const displayContact = useMemo(() => {
    if (contact) {
      return {
        id: contact.id,
        name: contact.name,
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        displayId:
          contact.number != null ? `C-${contact.number}` : contact.key,
        email: details?.email ?? contact.email ?? null,
        emails: normalizeContactEmails(details?.emails ?? contact.emails),
        phone: details?.phone ?? contact.phone ?? null,
        phones: normalizeContactPhones(
          details?.phones ?? contact.phones ?? [],
        ),
        title: details?.title ?? contact.title ?? null,
        address: details?.address ?? contact.address ?? null,
        city: details?.city ?? contact.city ?? null,
        postalCode: details?.postalCode ?? contact.postalCode ?? null,
        country: details?.country ?? contact.country ?? null,
        region: details?.region ?? contact.region ?? null,
        organizationId:
          contact.organizationId ?? details?.organizationId ?? null,
        organizationName: contact.organizationName,
        summary: details?.summary ?? null,
        socialAccounts: normalizeContactSocialAccounts(
          details?.socialAccounts ?? contact.socialAccounts,
        ),
        birthday: details?.birthday ?? contact.birthday ?? null,
        languages: coerceContactLanguages(
          details?.languages ?? contact.languages ?? [],
        ),
      };
    }
    const nameParts = (visitor?.contactName?.trim() || "").split(/\s+/);
    return {
      id: "communication-unmatched",
      name: visitorName,
      firstName: nameParts[0] || null,
      lastName: nameParts.slice(1).join(" ") || null,
      displayId: null,
      email: visitor?.contactEmail?.trim() || null,
      emails: visitor?.contactEmail?.trim()
        ? [{ label: "other" as const, address: visitor.contactEmail.trim() }]
        : [],
      phone: visitor?.contactPhone?.trim() || null,
      phones: visitor?.contactPhone?.trim()
        ? [{ label: "other" as const, number: visitor.contactPhone.trim() }]
        : [],
      title: null,
      address: null,
      city: null,
      postalCode: null,
      country: null,
      region: null,
      organizationId: null,
      organizationName: null,
      summary: null,
      socialAccounts: [],
      birthday: null,
      languages: [],
    };
  }, [contact, details, visitor, visitorName]);

  const coverAccessory = contact ? (
    <CommunicationContactCoverAvatar
      displayName={displayContact.name}
      avatarSrc={avatarSrc}
    />
  ) : (
    <CommunicationContactCoverAvatar
      displayName={displayContact.name}
      avatarSrc={avatarSrc}
      selectContact={{
        options: pickerOptions,
        disabled: linkingContact,
        onSelect: (nextId) => {
          void linkExistingContact(nextId);
        },
        onCreateFromQuery: (query) => {
          void createAndLinkContact(query);
        },
      }}
    />
  );

  const emailOrganization =
    emailOrganizationId != null
      ? (workspace.organizations.find(
          (entry) => entry.id === emailOrganizationId,
        ) ?? null)
      : null;
  const emailOrganizationName =
    emailOrganization?.name?.trim() ||
    emailItem?.organizationName?.trim() ||
    contact?.organizationName?.trim() ||
    null;
  const emailOrganizationAvatar =
    emailOrganizationId != null
      ? resolveOrganizationAvatarSrc({
          uploadedSrc: organizationAvatarSrc[emailOrganizationId] ?? null,
          avatarStorageKey: emailOrganization?.avatarStorageKey,
          website: emailOrganization?.website,
          brandfetchClientId: getBrandfetchClientId(),
        })
      : null;
  const emailContactId =
    emailActiveParty?.contactId?.trim() || contactId;
  const emailContactName =
    emailActiveParty?.partyName?.trim() || contact?.name?.trim() || null;
  const emailContactAvatar = emailContactId
    ? (contactAvatarSrc[emailContactId] ?? contact?.avatarSrc ?? null)
    : null;

  const emailSectionBody = (() => {
    if (!emailItem) return null;
    if (section === "conversation") {
      const partyEmail = visitor?.contactEmail?.trim() || null;
      const knownAddresses = contact
        ? new Set(
            getContactEmailAddresses({
              email: details?.email ?? contact.email,
              emails: normalizeContactEmails(
                details?.emails ?? contact.emails,
              ),
            }).map((address) => address.trim().toLowerCase()),
          )
        : new Set<string>();
      const missingAddress =
        Boolean(contact) &&
        Boolean(partyEmail) &&
        !knownAddresses.has(partyEmail!.toLowerCase());
      return (
        <>
          {missingAddress && contact ? (
            <div className="communication-chat-contact-empty__create">
              <p className="communication-chat-contact-empty__hint">
                This thread uses {partyEmail}, which is not on this contact
                yet.
              </p>
              <button
                type="button"
                onClick={() => {
                  void linkExistingContact(contact.id);
                }}
              >
                Link this email
              </button>
            </div>
          ) : null}
          {conversationDetails}
        </>
      );
    }
    if (section === "overview") {
      if (!contact) {
        return <UnmatchedContactTabHint kind="activity" />;
      }
      return (
        <CrmActivityFeedView
          items={activityFeed.items}
          loading={activityFeed.loading}
          error={activityFeed.error}
          nextCursor={activityFeed.nextCursor}
          onLoadMore={activityFeed.loadMore}
          onSubmitNote={activityFeed.submitNote}
          onCreateTask={() => {
            requestOpenComposeModal({ relatedContactIds: [contact.id] });
          }}
          onCreateEmail={() => {
            const to =
              getContactEmailAddresses({
                email: details?.email ?? contact.email,
                emails: normalizeContactEmails(
                  details?.emails ?? contact.emails,
                ),
              })[0] || undefined;
            resetEmailComposeSession();
            writeEmailComposeSession({
              sessionId: crypto.randomUUID(),
              draftId: null,
              inboxId: null,
              prefill: to ? { to } : null,
            });
            navigate(getEmailComposeHref());
          }}
        />
      );
    }
    if (section === "details") {
      if (!contact) {
        return <UnmatchedContactTabHint kind="contact" />;
      }
      return (
        <ContactRelationshipsListView
          items={relationships.items}
          loading={relationships.loading}
          error={relationships.error}
          relationshipLabels={relationshipLabels.labels}
          contactOptions={workspace.contacts
            .filter((entry) => entry.id !== contact.id)
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              avatarSrc: contactAvatarSrc[entry.id] ?? entry.avatarSrc ?? null,
            }))}
          onSelectContact={(id) => {
            const target = workspace.contacts.find((entry) => entry.id === id);
            if (!target) return;
            navigate(
              getContactOverlayHref(
                getUniqueListItemRouteParam(target, workspace.contacts),
              ),
            );
          }}
          onAdd={relationships.add}
          onRemove={relationships.remove}
          onCreateLabel={relationshipLabels.createLabel}
          onUpdateLabel={relationshipLabels.updateLabel}
          onDeleteLabel={relationshipLabels.deleteLabel}
        />
      );
    }
    if (section === "portal") {
      if (!contact) {
        return <UnmatchedContactTabHint kind="portal" />;
      }
      return (
        <div className="contact-detail__placeholder">
          <p className="overview-empty">
            Open the contact to manage portal settings.
          </p>
          <button type="button" onClick={openFullContact}>
            Open contact
          </button>
        </div>
      );
    }
    return null;
  })();

  return (
    <ContactDetailOverlay
      open={open}
      collapsed={collapsed}
      workspaceFaded={workspaceFaded}
      overlayLayout={overlayLayout}
      title={title}
      onExpand={contact ? expandOverlay : undefined}
      onCollapse={contact ? collapseOverlay : undefined}
      onHide={() => {
        if (overlayLayout === "page") {
          collapseOverlay();
          return;
        }
        onHide();
      }}
      onShow={onShow}
      workspaceTab={workspaceTab}
      onWorkspaceTabChange={setWorkspaceTab}
      renderWorkspaceTab={(tab) => {
        if (!contact) return null;
        if (tab === "meetings") {
          return (
            <ContactMeetingsListView
              contactId={contact.id}
              meetings={workspace.meetings}
              onSelectMeeting={(meetingId) => {
                navigate(getCalendarMeetingHref(meetingId));
              }}
            />
          );
        }
        if (tab === "emails") {
          return (
            <ContactEmailsListView
              contactId={contact.id}
              contactEmail={details?.email ?? contact.email}
              contactEmails={normalizeContactEmails(
                details?.emails ?? contact.emails,
              )}
              emails={agentMail.messages}
              onSelectEmail={(email) => {
                navigate(
                  getEmailDetailHref(email.inboxId, email.id, {
                    draftId: email.draftId,
                  }),
                );
              }}
            />
          );
        }
        if (tab === "tasks") {
          return (
            <ContactTasksListView
              contactId={contact.id}
              tasks={contactTasks}
              onSelectTask={(taskId) => {
                navigate(`/tasks/${taskId}`);
              }}
              onStatusChange={(taskId, status: TaskStatus) => {
                void workspace.patchTask(taskId, { status });
              }}
              onPriorityChange={(taskId, priority) => {
                void workspace.patchTask(taskId, { priority });
              }}
              onDueDateChange={(taskId, dueDate) => {
                void workspace.patchTask(taskId, {
                  dueDate: dueDate ? dueDate.toISOString() : null,
                });
              }}
              onBulkDelete={async (taskIds) => {
                for (const taskId of taskIds) {
                  await workspace.softDeleteTask(taskId);
                }
              }}
              onDeleteTask={async (task) => {
                try {
                  await workspace.softDeleteTask(task.id);
                  return { ok: true as const };
                } catch (error) {
                  return {
                    ok: false as const,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to delete task.",
                  };
                }
              }}
              onReorder={(request) => {
                const patches = taskReorderPatches(contactTasks, request);
                for (const patch of patches) {
                  void workspace.patchTask(patch.id, {
                    status: patch.status,
                    sortOrder: patch.sortOrder,
                  });
                }
              }}
            />
          );
        }
        if (tab === "letters") {
          return (
            <ScopedLettersListView
              letters={contactLetters}
              onSelectLetter={(letter) => {
                if (letter.number == null) return;
                navigate(
                  resolveLetterDetailHref({
                    id: letter.id,
                    number: letter.number,
                    listBaseHref: "/letters",
                  }),
                );
              }}
              onStatusChange={(letterId, status: TaskStatus) => {
                void workspace.patchLetter(letterId, { status });
              }}
              onDueDateChange={(letterId, dueDate) => {
                void workspace.patchLetter(letterId, {
                  dueDate: dueDate ? dueDate.toISOString() : null,
                });
              }}
            />
          );
        }
        if (tab === "social") {
          return (
            <SocialContactDetailView
              contact={{
                id: contact.id,
                name: contact.name,
                title: details?.title ?? contact.title,
                summary: details?.summary ?? null,
                socialAccounts: normalizeContactSocialAccounts(
                  details?.socialAccounts ?? contact.socialAccounts,
                ),
                city: details?.city ?? contact.city,
                region: details?.region ?? contact.region,
                country: details?.country ?? contact.country,
                organizationName: contact.organizationName,
                avatarSrc: avatarSrc,
              }}
            />
          );
        }
        return null;
      }}
    >
      {emailItem && !contact ? (
        <DesktopCommunicationEmailPartyCard
          partyName={title}
          organizationId={emailOrganizationId}
          organizationName={emailOrganizationName}
          organizationAvatarSrc={emailOrganizationAvatar}
          contactId={emailContactId}
          contactName={emailContactName}
          contactAvatarSrc={emailContactAvatar}
          organizationOptions={organizationOptions}
          contactOptions={contactOptions}
          sections={sections}
          section={section}
          onSectionChange={setSection}
          onSelectOrganization={(nextId) => {
            void linkExistingOrganization(nextId);
          }}
          onCreateOrganizationFromQuery={(query) => {
            void createAndLinkOrganization(query);
          }}
          onSelectContact={(nextId) => {
            void linkExistingContact(nextId);
          }}
          onCreateContactFromQuery={(query) => {
            void createAndLinkContact(query);
          }}
          linking={linkingContact}
        >
          {emailSectionBody}
        </DesktopCommunicationEmailPartyCard>
      ) : (
        <ContactDetailView
          contact={displayContact}
          organizationOptions={contact ? contactOrganizationOptions : []}
          groupOptions={contact ? groupOptions : []}
          memberGroupIds={contact ? memberGroupIds : []}
          onMemberGroupIdsChange={
            contact ? handleMemberGroupIdsChange : undefined
          }
          sections={sections}
          section={section}
          onSectionChange={setSection}
          overviewHeaderAccessory={coverAccessory}
          contactSwitcher={
            emailItem && contactOptions.length > 0
              ? {
                  options: contactOptions,
                  disabled: linkingContact,
                  onSelect: (nextId) => {
                    void linkExistingContact(nextId);
                  },
                  onCreateFromQuery: (query) => {
                    void createAndLinkContact(query);
                  },
                }
              : null
          }
          relationshipsSlot={
            contact ? (
              <ContactRelationshipsListView
                items={relationships.items}
                loading={relationships.loading}
                error={relationships.error}
                relationshipLabels={relationshipLabels.labels}
                contactOptions={workspace.contacts
                  .filter((entry) => entry.id !== contact.id)
                  .map((entry) => ({
                    id: entry.id,
                    name: entry.name,
                    avatarSrc:
                      contactAvatarSrc[entry.id] ?? entry.avatarSrc ?? null,
                  }))}
                onSelectContact={(id) => {
                  const target = workspace.contacts.find(
                    (entry) => entry.id === id,
                  );
                  if (!target) return;
                  navigate(
                    getContactOverlayHref(
                      getUniqueListItemRouteParam(target, workspace.contacts),
                    ),
                  );
                }}
                onAdd={relationships.add}
                onRemove={relationships.remove}
                onCreateLabel={relationshipLabels.createLabel}
                onUpdateLabel={relationshipLabels.updateLabel}
                onDeleteLabel={relationshipLabels.deleteLabel}
              />
            ) : (
              <UnmatchedContactTabHint kind="contact" />
            )
          }
          activitySlot={
            contact ? (
              <CrmActivityFeedView
                items={activityFeed.items}
                loading={activityFeed.loading}
                error={activityFeed.error}
                nextCursor={activityFeed.nextCursor}
                onLoadMore={activityFeed.loadMore}
                onSubmitNote={activityFeed.submitNote}
                onCreateTask={() => {
                  requestOpenComposeModal({ relatedContactIds: [contact.id] });
                }}
                onCreateEmail={() => {
                  const to =
                    getContactEmailAddresses({
                      email: details?.email ?? contact.email,
                      emails: normalizeContactEmails(
                        details?.emails ?? contact.emails,
                      ),
                    })[0] || undefined;
                  resetEmailComposeSession();
                  writeEmailComposeSession({
                    sessionId: crypto.randomUUID(),
                    draftId: null,
                    inboxId: null,
                    prefill: to ? { to } : null,
                  });
                  navigate(getEmailComposeHref());
                }}
              />
            ) : (
              <UnmatchedContactTabHint kind="activity" />
            )
          }
          onCreateOrganizationFromQuery={
            contact
              ? (query) => {
                  void workspace
                    .createOrganization({ name: query })
                    .then((created) => {
                      void workspace.patchContact(contact.id, {
                        organizationId: created.id,
                      });
                    });
                }
              : undefined
          }
          onSaveFirstName={
            contact
              ? async (firstName) => {
                  try {
                    await workspace.patchContact(contact.id, { firstName });
                    return { ok: true };
                  } catch (error) {
                    return {
                      ok: false,
                      error:
                        error instanceof Error
                          ? error.message
                          : "Could not save first name.",
                    };
                  }
                }
              : undefined
          }
          onSaveLastName={
            contact
              ? async (lastName) => {
                  try {
                    await workspace.patchContact(contact.id, { lastName });
                    return { ok: true };
                  } catch (error) {
                    return {
                      ok: false,
                      error:
                        error instanceof Error
                          ? error.message
                          : "Could not save last name.",
                    };
                  }
                }
              : undefined
          }
          onSaveDetails={
            contact
              ? (patch: ContactOverviewDetails) => {
                  void workspace.patchContact(contact.id, patch);
                }
              : undefined
          }
          renderSection={(sectionId) => {
            if (sectionId === "conversation") {
              if (emailItem && contact) {
                return emailSectionBody;
              }
              return conversationDetails;
            }
            if (sectionId === "portal") {
              if (!contact) {
                return <UnmatchedContactTabHint kind="portal" />;
              }
              return (
                <div className="contact-detail__placeholder">
                  <p className="overview-empty">
                    Open the contact to manage portal settings.
                  </p>
                  <button type="button" onClick={openFullContact}>
                    Open contact
                  </button>
                </div>
              );
            }
            return null;
          }}
        />
      )}
    </ContactDetailOverlay>
  );
}

function UnmatchedContactTabHint({
  kind,
}: {
  kind: "activity" | "contact" | "portal";
}) {
  const label =
    kind === "activity"
      ? "Activity"
      : kind === "portal"
        ? "Portal"
        : "Contact details";
  return (
    <div className="communication-chat-contact-empty">
      <p className="communication-chat-contact-empty__hint">
        Select a contact to unlock {label}.
      </p>
    </div>
  );
}

function CommunicationContactCoverAvatar({
  displayName,
  avatarSrc,
  selectContact,
}: {
  displayName: string;
  avatarSrc: string | null;
  selectContact?: {
    options: SearchableDropdownOption<string>[];
    disabled?: boolean;
    onSelect: (contactId: string) => void;
    onCreateFromQuery?: (query: string) => void;
  } | null;
}) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const image = avatarSrc ? (
    <img src={avatarSrc} alt="" className="avatar-upload__img" />
  ) : selectContact ? (
    <span aria-hidden="true" className="avatar-upload__placeholder">
      <ContactPersonIcon size={48} />
    </span>
  ) : (
    <span aria-hidden="true" className="avatar-upload__placeholder">
      {initial}
    </span>
  );

  if (selectContact) {
    return (
      <SearchableDropdown
        className="communication-chat-contact-cover-dropdown"
        value={null}
        options={selectContact.options}
        onChange={(next) => {
          const nextId = resolveDropdownNone(next);
          if (nextId) selectContact.onSelect(nextId);
        }}
        disabled={selectContact.disabled}
        searchPlaceholder="Search contacts…"
        ariaLabel="Select contact"
        panelWidth={280}
        panelAlign="start"
        createFromQueryLabel={
          selectContact.onCreateFromQuery
            ? (query) => getCreateEntityFromQueryLabel("contact", query)
            : undefined
        }
        onCreateFromQuery={selectContact.onCreateFromQuery}
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <div className="avatar-upload avatar-upload--cover">
            <div className="avatar-upload__frame">
              <button
                type="button"
                id={triggerId}
                className={[
                  "avatar-upload__button",
                  "avatar-upload__button--cover",
                  "communication-chat-contact-cover--select",
                  avatarSrc ? "avatar-upload__button--image" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={onToggle}
                disabled={disabled}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label="Select contact"
              >
                {image}
                <span className="avatar-upload__overlay">Select contact</span>
              </button>
            </div>
          </div>
        )}
      />
    );
  }

  return (
    <div className="avatar-upload avatar-upload--cover">
      <div className="avatar-upload__frame">
        <div
          className={[
            "avatar-upload__button",
            "avatar-upload__button--cover",
            "communication-chat-contact-cover--static",
            avatarSrc ? "avatar-upload__button--image" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          role="img"
          aria-label={displayName}
        >
          {image}
        </div>
      </div>
    </div>
  );
}
