import {
  memo,
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
  type ContactPortalSettings,
} from "@backsteros/contracts";

import {
  ChatConversationDetailsView,
  CONTACT_DETAIL_EXPAND_FADE_MS,
  ContactDetailOverlay,
  ContactDetailView,
  EntityCommunicationListView,
  ContactMeetingsListView,
  ContactPersonIcon,
  ContactPortalTabView,
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
  organizationMatchesEmailAddress,
  OrganizationOverviewView,
  previousChatConversations,
  requestOpenComposeModal,
  resolveChatContactCardSections,
  resolveCommunicationEmailCardSections,
  resolveCommunicationSupportCardSections,
  resolveDropdownNone,
  resolveLetterDetailHref,
  resolveOrganizationAvatarSrc,
  ScopedLettersListView,
  SearchableDropdown,
  SegmentedPillToggle,
  SocialContactDetailView,
  taskReorderPatches,
  type ChatConversationStatus,
  type ContactExpandedWorkspaceTabId,
  type ContactListItem,
  type ContactOverlayLayout,
  type ContactOverviewDetails,
  type ContactSectionId,
  type InboxEmailListItem,
  type OrganizationOverviewDetails,
  type SearchableDropdownOption,
  type TaskStatus,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { filterCommunicationForContact } from "../lib/communication/filter-entity-communication";
import { useCommunicationListItems } from "../lib/communication/use-communication-list-items";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
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
import { useContactPortalEmailActions } from "../lib/use-contact-portal-email-actions";
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
   * When true with `emailItem`, treat the rail as a support ticket (Details
   * tab label + sections) instead of an e-mail thread.
   */
  supportTicket?: boolean;
  /**
   * Active message party in the Communication Chat thread (per-message
   * org/contact). Overrides thread-level ids for the party card.
   * For support tickets, pass the filed contact/org here the same way.
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
  /** Clear the linked contact on the active email message party. */
  onUnlinkContact?: () => void | Promise<void>;
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
 * a BacksterOS contact (email/phone). First tab is Details (chat) or E-mail.
 * Expand opens Meetings/Emails/Tasks/Letters over the chat; collapse restores it.
 */
function DesktopChatContactDetailPanelView({
  open,
  contact,
  visitor,
  conversation,
  conversations,
  emailItem = null,
  supportTicket = false,
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
  onUnlinkContact,
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
  const communicationItems = useCommunicationListItems();
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const [section, setSection] = useState<ContactSectionId>("conversation");
  const [overlayLayout, setOverlayLayout] =
    useState<ContactOverlayLayout>("panel");
  const [workspaceTab, setWorkspaceTab] =
    useState<ContactExpandedWorkspaceTabId>("meetings");
  const [workspaceFaded, setWorkspaceFaded] = useState(false);
  const [linkingContact, setLinkingContact] = useState(false);
  const [portalSaveError, setPortalSaveError] = useState<string | null>(null);
  const [portalAvatarOverride, setPortalAvatarOverride] = useState<
    string | null | undefined
  >(undefined);
  /** Party addresses claimed via the dashed-chip check (optimistic known state). */
  const [optimisticKnownPartyEmails, setOptimisticKnownPartyEmails] = useState(
    () => new Set<string>(),
  );
  const [addingPartyEmail, setAddingPartyEmail] = useState(false);
  const [contactTabEntity, setContactTabEntity] = useState<
    "contact" | "organization"
  >("contact");
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
  const { onSendPortalInvite, onSendPortalPasswordReset } =
    useContactPortalEmailActions(contactId);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const portalAvatarEntities = useMemo(
    () =>
      workspace.contacts
        .filter((entry) => entry.portalAvatarStorageKey)
        .map((entry) => ({
          id: entry.id,
          avatarStorageKey: entry.portalAvatarStorageKey,
          avatarUpdatedAt: entry.avatarUpdatedAt,
        })),
    [workspace.contacts],
  );
  const portalAvatarSrcMap = useDesktopAvatarSrcMap(
    "avatar_portal",
    portalAvatarEntities,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );

  // Reset rail chrome when the open chat/email changes — not when contactId
  // appears after a party link (that was snapping every tab click back to Details).
  useEffect(() => {
    setSection("conversation");
    setOverlayLayout("panel");
    setWorkspaceTab("meetings");
    setWorkspaceFaded(false);
    setChatFaded(false);
    setLinkingContact(false);
    setPortalSaveError(null);
    setAddingPartyEmail(false);
    setOptimisticKnownPartyEmails(new Set());
    setContactTabEntity("contact");
    setPortalAvatarOverride((current) => {
      if (current) URL.revokeObjectURL(current);
      return undefined;
    });
  }, [conversation?.id, emailItem?.id, setChatFaded]);

  useEffect(() => {
    setPortalSaveError(null);
    setOptimisticKnownPartyEmails(new Set());
    setPortalAvatarOverride((current) => {
      if (current) URL.revokeObjectURL(current);
      return undefined;
    });
  }, [contactId]);

  useEffect(() => {
    setOptimisticKnownPartyEmails(new Set());
  }, [emailActiveParty?.organizationId]);

  useEffect(() => {
    setContactTabEntity(contactId ? "contact" : "organization");
  }, [contactId, emailActiveParty?.organizationId]);

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

  const emailPartyOrganizationId =
    emailItem && emailActiveParty?.organizationId?.trim()
      ? emailActiveParty.organizationId.trim()
      : null;
  const activityFeed = useCrmActivityFeed(
    "contact",
    contactId,
    open && Boolean(contactId) && section === "overview",
  );
  // Org-only email parties use the same CRM activity feed as Organizations.
  const organizationActivityFeed = useCrmActivityFeed(
    "organization",
    emailPartyOrganizationId,
    open &&
      Boolean(emailPartyOrganizationId) &&
      !contactId &&
      section === "overview",
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
  const emptyMemberGroupIds = useMemo<string[]>(() => [], []);
  const appliedMemberGroupIdsRef = useRef(memberGroupIds);
  useEffect(() => {
    appliedMemberGroupIdsRef.current = memberGroupIds;
  }, [memberGroupIds]);
  const membershipSyncChainRef = useRef(Promise.resolve());

  const contactInClientsGroup = useMemo(
    () =>
      groupOptions.some(
        (group) =>
          group.name.trim().toLowerCase() === "clients" &&
          memberGroupIds.includes(group.id),
      ),
    [groupOptions, memberGroupIds],
  );

  // Org/contact for email is only the focused message party — never soft-match
  // or emailItem.contactId/organizationId (those paint unfiled parties as linked).
  const emailOrganizationId =
    emailActiveParty?.organizationId?.trim() || null;
  const emailPartyContactId = emailActiveParty?.contactId?.trim() || null;
  const emailPartyLinked = Boolean(
    emailItem && (emailOrganizationId || emailPartyContactId),
  );
  // Portal only when a real contact is selected (and in Clients) — never the
  // "Select a contact to unlock Portal" empty state as a tab.
  const showPortalTab = Boolean(contact) && contactInClientsGroup;

  const sections = useMemo(() => {
    if (emailItem && supportTicket) {
      return resolveCommunicationSupportCardSections({
        linked: emailPartyLinked,
        showPortal: showPortalTab,
        showPortalLogs: false,
      });
    }
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
  }, [emailItem, emailPartyLinked, showPortalTab, supportTicket]);

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

  const portalProjects = useMemo(() => {
    const organizationId =
      details?.organizationId ?? contact?.organizationId ?? null;
    if (!organizationId) return [];
    return workspace.projects
      .filter((project) => project.organizationId === organizationId)
      .map((project) => ({
        id: project.id,
        name: project.name,
        key: project.key ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contact?.organizationId, details?.organizationId, workspace.projects]);

  const portalSectionBody = useMemo(() => {
    if (!contact) {
      return <UnmatchedContactTabHint kind="portal" />;
    }
    return (
      <ContactPortalTabView
        settings={
          contact.portalSettings as ContactPortalSettings | null | undefined
        }
        portalUsername={contact.portalUsername}
        portalPasswordSet={Boolean(contact.portalPasswordSet)}
        projects={portalProjects}
        emails={getContactEmailAddresses({
          email: details?.email ?? contact.email,
          emails: details?.emails ?? contact.emails,
        }).map((address) => ({ address }))}
        reservedPortalUsernames={workspace.contacts
          .filter((entry) => entry.id !== contact.id)
          .map((entry) => entry.portalUsername?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value))}
        error={portalSaveError}
        displayName={contact.name}
        portalAvatarSrc={
          portalAvatarOverride === undefined
            ? (portalAvatarSrcMap[contact.id] ?? null)
            : portalAvatarOverride
        }
        onUploadPortalAvatar={async (file) => {
          const result = await uploadDesktopAvatar(
            client,
            "avatar_portal",
            contact.id,
            file,
          );
          if (result.ok) {
            const url = URL.createObjectURL(file);
            setPortalAvatarOverride((current) => {
              if (current) URL.revokeObjectURL(current);
              return url;
            });
          }
          return result;
        }}
        onRemovePortalAvatar={async () => {
          const result = await removeDesktopAvatar(
            client,
            "avatar_portal",
            contact.id,
          );
          if (result.ok) {
            setPortalAvatarOverride((current) => {
              if (current) URL.revokeObjectURL(current);
              return null;
            });
          }
          return result;
        }}
        onSave={async ({ settings, portalUsername, portalPassword }) => {
          setPortalSaveError(null);
          try {
            if (portalUsername === null && portalPassword === "") {
              await client.requestJson(
                `/api/v1/contacts/${encodeURIComponent(contact.id)}`,
                {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    portalUsername: null,
                    portalPassword: "",
                  }),
                },
              );
              await workspace.patchContact(contact.id, {
                portalUsername: null,
              });
              return;
            }
            // Password is REST-only. Never follow with settings/PowerSync in the
            // same turn — a queued contact upload with a stale
            // `portal_password_hash` can clobber the hash we just set.
            if (portalPassword !== null) {
              await client.requestJson(
                `/api/v1/contacts/${encodeURIComponent(contact.id)}`,
                {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    portalPassword,
                    ...(portalUsername
                      ? { portalUsername }
                      : contact.portalUsername
                        ? { portalUsername: contact.portalUsername }
                        : {}),
                  }),
                },
              );
              return;
            }
            await client.requestJson(
              `/api/v1/contacts/${encodeURIComponent(contact.id)}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  portalSettings: settings,
                  portalUsername,
                }),
              },
            );
            await workspace.patchContact(contact.id, {
              portalSettings: settings,
              portalUsername,
            });
          } catch (error) {
            setPortalSaveError(
              error instanceof Error
                ? error.message
                : "Failed to save portal settings",
            );
            throw error;
          }
        }}
        onSendInvite={
          onSendPortalInvite
            ? async () => {
                setPortalSaveError(null);
                try {
                  await onSendPortalInvite();
                } catch (error) {
                  setPortalSaveError(
                    error instanceof Error
                      ? error.message
                      : "Failed to send portal invite",
                  );
                  throw error;
                }
              }
            : undefined
        }
        onSendPasswordReset={
          onSendPortalPasswordReset
            ? async () => {
                setPortalSaveError(null);
                try {
                  await onSendPortalPasswordReset();
                } catch (error) {
                  setPortalSaveError(
                    error instanceof Error
                      ? error.message
                      : "Failed to send password reset",
                  );
                  throw error;
                }
              }
            : undefined
        }
      />
    );
  }, [
    client,
    contact,
    details?.email,
    details?.emails,
    onSendPortalInvite,
    onSendPortalPasswordReset,
    portalAvatarOverride,
    portalAvatarSrcMap,
    portalProjects,
    portalSaveError,
    workspace,
  ]);

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
        const name =
          query?.trim() || visitor?.contactName?.trim() || "Organization";
        const partyEmail = visitor?.contactEmail?.trim() || null;
        const created = await workspace.createOrganization({ name });
        // Seed the party From address so classify/auto-link keep this org
        // instead of treating an empty org as a soft-match wipe candidate.
        if (partyEmail?.includes("@")) {
          try {
            await workspace.patchOrganization(created.id, {
              email: partyEmail,
              emails: [{ label: "general" as const, address: partyEmail }],
            });
            setOptimisticKnownPartyEmails((prev) => {
              const next = new Set(prev);
              next.add(partyEmail.toLowerCase());
              return next;
            });
          } catch (error) {
            console.warn(
              "[desktop] seed party email on new organization failed",
              error,
            );
          }
        }
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
    [onLinkOrganization, visitor?.contactEmail, visitor?.contactName, workspace],
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
        timezone: details?.timezone ?? contact.timezone ?? null,
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
  const emailOrganizationDetails =
    emailOrganizationId != null
      ? (workspace.organizationDetails[emailOrganizationId] ?? null)
      : null;
  // Only the focused message party’s org — never thread-level emailItem.organizationName
  // (that sticks “Lemo-Design” on the rail while another From is selected).
  const emailOrganizationName = emailOrganization?.name?.trim() || null;
  const emailOrganizationAvatar =
    emailOrganizationId != null
      ? resolveOrganizationAvatarSrc({
          uploadedSrc: organizationAvatarSrc[emailOrganizationId] ?? null,
          avatarStorageKey: emailOrganization?.avatarStorageKey,
          website: emailOrganization?.website,
          brandfetchClientId: getBrandfetchClientId(),
        })
      : null;
  const emailContactId = emailPartyContactId;
  const emailContactName = emailContactId
    ? contact?.name?.trim() ||
      emailActiveParty?.partyName?.trim() ||
      null
    : emailActiveParty?.partyEmail?.trim() ||
      emailActiveParty?.partyName?.trim() ||
      null;
  const emailContactAvatar = emailContactId
    ? (contactAvatarSrc[emailContactId] ?? contact?.avatarSrc ?? null)
    : null;
  const partyEmailBelongsToOrganization = useMemo(() => {
    const address =
      emailActiveParty?.partyEmail?.trim() ||
      emailActiveParty?.partyName?.trim() ||
      null;
    if (!emailOrganizationId || !address || !address.includes("@")) {
      return false;
    }
    const needle = address.trim().toLowerCase();
    if (optimisticKnownPartyEmails.has(needle)) return true;
    const matchable = {
      id: emailOrganizationId,
      email:
        emailOrganizationDetails?.email ?? emailOrganization?.email ?? null,
      emails:
        emailOrganizationDetails?.emails ?? emailOrganization?.emails ?? null,
    };
    return organizationMatchesEmailAddress(matchable, address);
  }, [
    emailActiveParty?.partyEmail,
    emailActiveParty?.partyName,
    emailOrganization?.email,
    emailOrganization?.emails,
    emailOrganizationDetails?.email,
    emailOrganizationDetails?.emails,
    emailOrganizationId,
    optimisticKnownPartyEmails,
  ]);

  const addPartyEmailAsOther = useCallback(async () => {
    const address =
      emailActiveParty?.partyEmail?.trim() ||
      (emailActiveParty?.partyName?.includes("@")
        ? emailActiveParty.partyName.trim()
        : null);
    if (!address?.includes("@") || addingPartyEmail) return;
    const needle = address.trim().toLowerCase();

    // Flip the dashed chip to known immediately; roll back if the patch fails.
    setOptimisticKnownPartyEmails((prev) => {
      if (prev.has(needle)) return prev;
      const next = new Set(prev);
      next.add(needle);
      return next;
    });
    setAddingPartyEmail(true);

    try {
      // Prefer the linked contact when present; otherwise the selected org.
      if (emailPartyContactId) {
        const target =
          workspace.contacts.find((entry) => entry.id === emailPartyContactId) ??
          null;
        if (!target) {
          setOptimisticKnownPartyEmails((prev) => {
            const next = new Set(prev);
            next.delete(needle);
            return next;
          });
          return;
        }
        const existing = normalizeContactEmails(
          workspace.contactDetails[emailPartyContactId]?.emails ??
            target.emails,
        );
        if (
          !existing.some(
            (entry) => entry.address.trim().toLowerCase() === needle,
          )
        ) {
          await workspace.patchContact(emailPartyContactId, {
            emails: [...existing, { label: "other" as const, address }],
            ...(target.email?.trim() ? {} : { email: address }),
          });
        }
        return;
      }

      if (!emailOrganizationId) {
        setOptimisticKnownPartyEmails((prev) => {
          const next = new Set(prev);
          next.delete(needle);
          return next;
        });
        return;
      }
      const listOrg = emailOrganization;
      const detail = emailOrganizationDetails;
      const primary = detail?.email ?? listOrg?.email ?? null;
      const existing = [
        ...(detail?.emails ?? listOrg?.emails ?? []),
      ].filter(
        (
          entry,
        ): entry is {
          label: "general" | "support" | "other";
          address: string;
        } => Boolean(entry?.address?.trim()),
      );
      const alreadyPrimary = primary?.trim().toLowerCase() === needle;
      const alreadyListed = existing.some(
        (entry) => entry.address.trim().toLowerCase() === needle,
      );
      if (alreadyPrimary || alreadyListed) return;
      await workspace.patchOrganization(emailOrganizationId, {
        emails: [...existing, { label: "other" as const, address }],
        ...(primary?.trim() ? {} : { email: address }),
      });
    } catch (error) {
      setOptimisticKnownPartyEmails((prev) => {
        const next = new Set(prev);
        next.delete(needle);
        return next;
      });
      console.warn("[desktop] add party email as other failed", error);
    } finally {
      setAddingPartyEmail(false);
    }
  }, [
    addingPartyEmail,
    emailActiveParty?.partyEmail,
    emailActiveParty?.partyName,
    emailOrganization,
    emailOrganizationDetails,
    emailOrganizationId,
    emailPartyContactId,
    workspace,
  ]);

  const addPartyEmailAsOtherLabel = emailPartyContactId
    ? "Add email to contact as other"
    : "Add email to organization as other";

  // Contact tab: party-selected org (email) or the contact’s own organization.
  const contactTabOrganizationId =
    emailOrganizationId ||
    contact?.organizationId?.trim() ||
    details?.organizationId?.trim() ||
    null;
  const contactTabOrganization =
    contactTabOrganizationId != null
      ? (workspace.organizations.find(
          (entry) => entry.id === contactTabOrganizationId,
        ) ?? null)
      : null;
  const contactTabOrganizationDetails =
    contactTabOrganizationId != null
      ? (workspace.organizationDetails[contactTabOrganizationId] ?? null)
      : null;
  const contactTabOrganizationViewModel = useMemo(() => {
    if (!contactTabOrganization) return null;
    const detail = contactTabOrganizationDetails;
    const number = detail?.number ?? contactTabOrganization.number;
    return {
      id: contactTabOrganization.id,
      name: detail?.name?.trim() || contactTabOrganization.name,
      key: detail?.key ?? contactTabOrganization.key,
      number,
      displayId:
        number != null
          ? `O-${number}`
          : (detail?.key ?? contactTabOrganization.key),
      phone: detail?.phone ?? contactTabOrganization.phone ?? null,
      email: detail?.email ?? contactTabOrganization.email ?? null,
      emails: detail?.emails ?? contactTabOrganization.emails ?? undefined,
      phones: detail?.phones ?? contactTabOrganization.phones ?? undefined,
      website: detail?.website ?? contactTabOrganization.website ?? null,
      address: detail?.address ?? contactTabOrganization.address ?? null,
      city: detail?.city ?? contactTabOrganization.city ?? null,
      postalCode:
        detail?.postalCode ?? contactTabOrganization.postalCode ?? null,
      country: detail?.country ?? contactTabOrganization.country ?? null,
      region: detail?.region ?? contactTabOrganization.region ?? null,
      latitude: detail?.latitude ?? null,
      longitude: detail?.longitude ?? null,
      summary: detail?.summary ?? null,
      size: detail?.size ?? null,
      socialAccounts: detail?.socialAccounts ?? undefined,
      chamberOfCommerce: detail?.chamberOfCommerce ?? null,
      taxNumber: detail?.taxNumber ?? null,
      moneybirdContactId:
        detail?.moneybirdContactId ??
        contactTabOrganization.moneybirdContactId ??
        null,
    };
  }, [contactTabOrganization, contactTabOrganizationDetails]);

  const patchContactTabOrganization = useCallback(
    (patch: OrganizationOverviewDetails) => {
      if (!contactTabOrganization) return;
      void workspace.patchOrganization(contactTabOrganization.id, patch);
    },
    [contactTabOrganization, workspace],
  );

  const saveContactTabOrganizationName = useCallback(
    async (name: string) => {
      if (!contactTabOrganization) {
        return { ok: false as const, error: "No organization selected." };
      }
      try {
        await workspace.patchOrganization(contactTabOrganization.id, { name });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not save organization name.",
        };
      }
    },
    [contactTabOrganization, workspace],
  );

  // Org details for the Contact tab — unwrapped (no title chrome). Only mount
  // while that tab is active so heavy editors do not remount on Activity.
  const organizationDetailsBody =
    section === "details" && contactTabOrganizationViewModel != null ? (
      <OrganizationOverviewView
        key={contactTabOrganizationViewModel.id}
        hideChrome
        mode="details"
        organization={contactTabOrganizationViewModel}
        onSaveName={saveContactTabOrganizationName}
        onSaveDetails={patchContactTabOrganization}
      />
    ) : null;

  const showContactOrgEntityTabs = Boolean(
    contact && contactTabOrganizationViewModel,
  );
  const contactTabEntityToggle = showContactOrgEntityTabs ? (
    <div className="communication-chat-contact-entity-tabs">
      <SegmentedPillToggle
        ariaLabel="Contact or organization details"
        value={contactTabEntity}
        options={[
          { value: "contact" as const, label: "Contact" },
          { value: "organization" as const, label: "Organization" },
        ]}
        onChange={setContactTabEntity}
      />
    </div>
  ) : null;

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
      if (contact) {
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
            onOpenMeeting={(meetingId) => {
              navigate(getCalendarMeetingHref(meetingId));
            }}
          />
        );
      }
      if (emailPartyOrganizationId) {
        return (
          <CrmActivityFeedView
            items={organizationActivityFeed.items}
            loading={organizationActivityFeed.loading}
            error={organizationActivityFeed.error}
            nextCursor={organizationActivityFeed.nextCursor}
            onLoadMore={organizationActivityFeed.loadMore}
            onSubmitNote={organizationActivityFeed.submitNote}
            onOpenMeeting={(meetingId) => {
              navigate(getCalendarMeetingHref(meetingId));
            }}
          />
        );
      }
      return <UnmatchedContactTabHint kind="activity" />;
    }
    if (section === "details") {
      // Org-only party card: organization details as the tab body (no wrapper).
      if (organizationDetailsBody) return organizationDetailsBody;
      return <UnmatchedContactTabHint kind="contact" />;
    }
    if (section === "portal") {
      return portalSectionBody;
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
          const scoped = filterCommunicationForContact({
            contact: {
              id: contact.id,
              email: details?.email ?? contact.email,
              emails: normalizeContactEmails(
                details?.emails ?? contact.emails,
              ),
              phone: details?.phone ?? contact.phone,
              phones: normalizeContactPhones(
                details?.phones ?? contact.phones ?? [],
              ),
            },
            items: communicationItems,
            conversations,
          });
          return (
            <EntityCommunicationListView
              conversations={scoped.conversations}
              emails={scoped.emails}
              supportTasks={scoped.supportTasks}
              resolveAvatarSrc={() => contactAvatarSrc[contact.id] ?? null}
              resolveEmailAvatarSrc={(item) => {
                const contactId = item.contactId?.trim();
                if (contactId) return contactAvatarSrc[contactId] ?? null;
                return contactAvatarSrc[contact.id] ?? null;
              }}
              onSelectChat={(conversationId) => {
                onSelectConversation?.(conversationId);
                setOverlayLayout("panel");
              }}
              onSelectEmail={(emailId) => {
                const item = scoped.emails.find((entry) => entry.id === emailId);
                if (!item) return;
                navigate(
                  getEmailDetailHref(item.inboxId, item.messageId, {
                    draftId: item.draftId,
                  }),
                );
              }}
              onSelectSupport={(supportId) => {
                navigate(`/tasks/${supportId}`);
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
      {emailItem ? (
        // Always use the email party card so org + contact pickers stay
        // available — even when From already matched a contact. Switching to
        // ContactDetailView hid the organization dropdown.
        <DesktopCommunicationEmailPartyCard
          partyName={
            emailActiveParty?.partyEmail?.trim() ||
            emailActiveParty?.partyName?.trim() ||
            title
          }
          organizationId={emailOrganizationId}
          organizationName={emailOrganizationName}
          organizationAvatarSrc={emailOrganizationAvatar}
          contactId={emailContactId}
          contactName={emailContactName}
          contactAvatarSrc={emailContactAvatar}
          partyEmailBelongsToOrganization={partyEmailBelongsToOrganization}
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
          onClearContact={
            onUnlinkContact
              ? () => {
                  void onUnlinkContact();
                }
              : undefined
          }
          onAddPartyEmailAsOther={
            emailOrganizationId || emailPartyContactId
              ? () => addPartyEmailAsOther()
              : undefined
          }
          addPartyEmailAsOtherLabel={addPartyEmailAsOtherLabel}
          onCreateContactFromQuery={(query) => {
            void createAndLinkContact(query);
          }}
          linking={linkingContact || addingPartyEmail}
        >
          {emailSectionBody}
        </DesktopCommunicationEmailPartyCard>
      ) : (
        <ContactDetailView
          contact={displayContact}
          organizationOptions={contact ? contactOrganizationOptions : []}
          groupOptions={contact ? groupOptions : []}
          memberGroupIds={contact ? memberGroupIds : emptyMemberGroupIds}
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
                  onClear: onUnlinkContact
                    ? () => {
                        void onUnlinkContact();
                      }
                    : undefined,
                  onCreateFromQuery: (query) => {
                    void createAndLinkContact(query);
                  },
                }
              : null
          }
          detailsLeadSlot={
            section === "details" ? contactTabEntityToggle : null
          }
          hideDetailsFields={
            section === "details" &&
            showContactOrgEntityTabs &&
            contactTabEntity === "organization"
          }
          relationshipsSlot={
            contact &&
            !(
              showContactOrgEntityTabs && contactTabEntity === "organization"
            ) ? (
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
            ) : null
          }
          detailsExtraSlot={
            section === "details" &&
            showContactOrgEntityTabs &&
            contactTabEntity === "organization"
              ? organizationDetailsBody
              : null
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
                onOpenMeeting={(meetingId) => {
                  navigate(getCalendarMeetingHref(meetingId));
                }}
              />
            ) : emailPartyOrganizationId ? (
              <CrmActivityFeedView
                items={organizationActivityFeed.items}
                loading={organizationActivityFeed.loading}
                error={organizationActivityFeed.error}
                nextCursor={organizationActivityFeed.nextCursor}
                onLoadMore={organizationActivityFeed.loadMore}
                onSubmitNote={organizationActivityFeed.submitNote}
                onOpenMeeting={(meetingId) => {
                  navigate(getCalendarMeetingHref(meetingId));
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
              return portalSectionBody;
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

export const DesktopChatContactDetailPanel = memo(DesktopChatContactDetailPanelView);
