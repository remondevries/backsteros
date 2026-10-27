import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  coerceContactLanguages,
  formatContactDisplayName,
  getContactEmailAddresses,
  taskInvolvesContact,
  type ContactPortalSettings,
} from "@backsteros/contracts";

import {
  AvatarUpload,
  CommunicationChatView,
  ContactDetailOverlay,
  ContactDetailView,
  ContactRelationshipsListView,
  ContactTasksListView,
  ContactsOverviewView,
  CONTACT_DETAIL_COLLAPSE_DURATION_MS,
  CONTACT_DETAIL_CONTENT_FADE_MS,
  CONTACT_DETAIL_EXPAND_FADE_MS,
  CONTACT_EXPANDED_WORKSPACE_TAB_IDS,
  CONTACT_SECTIONS,
  contactExpandedWorkspaceDigitStartIndex,
  ContactPortalTabView,
  ContactPortalLogsTabView,
  CrmActivityFeedView,
  EntityDetailLayout,
  RegisterEntityDeleteAction,
  RegisterPageIcon,
  RegisterPageTitle,
  ScopedLettersListView,
  getContactOverlayHref,
  getContactsGroupHref,
  getEmailComposeHref,
  getOrganizationSectionHref,
  getScopedContactEmailHref,
  getScopedContactEmailsListHref,
  getScopedContactLetterHref,
  getScopedContactMeetingHref,
  getScopedContactMeetingsListHref,
  getScopedContactSectionHref,
  getScopedContactTaskHref,
  getScopedContactsListHref,
  resolveContactCardSections,
  resolveLetterDetailHref,
  getUniqueListItemRouteParam,
  isContactCardSectionId,
  isContactScopedEntityDetailPath,
  isContactSectionDetailPath,
  isContactSectionId,
  isHabitLinkedTask,
  migrateLegacyTaskStatus,
  normalizeContactSocialAccounts,
  asCoord,
  parseContactOverlayLayout,
  resolveCrmGroupRedirect,
  parseContactScopedEntityDetail,
  parseContactSectionId,
  parseCrmGroupId,
  parseSectionTabIndex,
  requestOpenComposeModal,
  resolveListItemFromSlug,
  shouldHandleGlobalShortcut,
  type ContactExpandedWorkspaceTabId,
  type ContactListItem,
  type ContactOverlayLayout,
  type ContactRouteScope,
  type ContactScopedEntityDetail,
  type ContactSectionId,
  type TaskStatus,
  taskReorderPatches,
} from "@backsteros/ui";

import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useDesktopApi } from "../lib/api-context";
import { useChatInbox } from "../lib/chat/use-chat-inbox";
import { filterCommunicationForContact } from "../lib/communication/filter-entity-communication";
import { useCommunicationListItems } from "../lib/communication/use-communication-list-items";
import { useContactPortalEmailActions } from "../lib/use-contact-portal-email-actions";
import { useContactPortalLogs } from "../lib/use-contact-portal-logs";
import { useDesktopPowerSync } from "../lib/powersync-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  normalizeContactEmails,
  normalizeContactPhones,
} from "../lib/contact-row-normalizers";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import {
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../lib/email-compose-session";
import {
  addCrmGroupMemberWithRetry,
  notifyCrmGroupsChanged,
  useContactRelationships,
  useCrmActivityFeed,
  useCrmContactGroupsByContactId,
  useCrmGroupContactIds,
  useCrmGroupsCatalog,
  useCrmRelationshipLabels,
} from "../lib/use-crm-data";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useContactPropertyHandlers } from "../lib/crm/use-crm-property-handlers";
import { useCrmSubjectGroupMembership } from "../lib/crm/use-crm-subject-group-membership";
import { useEntityDetailOverlayTransition } from "../lib/crm/use-entity-detail-overlay-transition";
import { useMapboxEntityLocation } from "../lib/crm/use-mapbox-entity-location";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";
import {
  ContactWorkspaceTabPanel,
  type ContactWorkspaceTabPanelHandlers,
} from "./contacts/contact-workspace-tab-panel";
import { EmailPage } from "./email-page";
import { LettersPage } from "./letters-page";
import { MeetingDetailPage } from "./meeting-detail-page";
import { TaskDetailPage } from "./task-detail-page";

function contactSlug(
  contact: {
    number?: number | null;
    key?: string | null;
    id: string;
  },
  siblings: readonly {
    number?: number | null;
    key?: string | null;
    id: string;
  }[],
) {
  return getUniqueListItemRouteParam(contact, siblings);
}

const CONTACT_DETAIL_OVERLAY_DURATIONS = {
  expandFadeMs: CONTACT_DETAIL_EXPAND_FADE_MS,
  collapseMs: CONTACT_DETAIL_COLLAPSE_DURATION_MS,
  contentFadeMs: CONTACT_DETAIL_CONTENT_FADE_MS,
};

export type ContactsPageProps = {
  organizationRouteParam?: string;
  organizationName?: string;
};

export function ContactsPage({
  organizationRouteParam,
  organizationName,
}: ContactsPageProps = {}) {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const keepAliveActive = useKeepAliveActive();
  const location = useShellLocation();
  const { slug, contactSlug: contactSlugParam, section: sectionParam } =
    useShellParams() as {
      slug?: string;
      contactSlug?: string;
      section?: string;
    };
  const routedSlug = contactSlugParam ?? slug;
  const routeScope = useMemo<ContactRouteScope>(
    () =>
      organizationRouteParam
        ? { kind: "organization", organizationRouteParam }
        : { kind: "standalone" },
    [organizationRouteParam],
  );
  const contactsListHref = getScopedContactsListHref(routeScope);
  const workspace = useDesktopWorkspaceData();
  const communicationItems = useCommunicationListItems();
  const keepAliveFrozen = useKeepAliveFrozen();
  const { client } = useDesktopApi();
  const [workspaceChatId, setWorkspaceChatId] = useState<string | null>(null);
  const powerSync = useDesktopPowerSync();
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);
  const [portalAvatarOverride, setPortalAvatarOverride] = useState<
    string | null | undefined
  >(undefined);

  const contacts = workspace.contacts;
  const { organizations, allTasks: tasks, letters, meetings } = workspace;
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : contacts,
  );
  const portalAvatarEntities = useMemo(
    () =>
      contacts
        .filter((entry) => entry.portalAvatarStorageKey)
        .map((entry) => ({
          id: entry.id,
          avatarStorageKey: entry.portalAvatarStorageKey,
          avatarUpdatedAt: entry.avatarUpdatedAt,
        })),
    [contacts],
  );
  const portalAvatarSrcMap = useDesktopAvatarSrcMap(
    "avatar_portal",
    keepAliveFrozen ? [] : portalAvatarEntities,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : organizations,
  );

  const isStandalone = routeScope.kind === "standalone";
  const workspaceDetail = useMemo(
    () =>
      isStandalone ? parseContactScopedEntityDetail(location.pathname) : null,
    [isStandalone, location.pathname],
  );
  const overlayLayout: ContactOverlayLayout =
    workspaceDetail != null || workspaceChatId != null
      ? "page"
      : parseContactOverlayLayout(location.searchStr ?? "");
  const chatInbox = useChatInbox({
    enabled: keepAliveActive && overlayLayout === "page",
    channelFocused: keepAliveActive && Boolean(workspaceChatId),
  });
  const selectedGroupId = parseCrmGroupId(location.searchStr ?? "");
  const groupsCatalog = useCrmGroupsCatalog(isStandalone && keepAliveActive);
  const effectiveGroupId = groupsCatalog.resolveGroupId(selectedGroupId);
  const groupMembers = useCrmGroupContactIds(
    effectiveGroupId,
    isStandalone && keepAliveActive && Boolean(effectiveGroupId),
  );
  const groupsByContactId = useCrmContactGroupsByContactId(keepAliveActive);
  const selectedGroupName = effectiveGroupId
    ? (groupsCatalog.groups.find((group) => group.id === effectiveGroupId)
        ?.name ?? null)
    : null;

  useEffect(() => {
    if (!isStandalone) return;
    const redirectId = resolveCrmGroupRedirect(
      selectedGroupId,
      effectiveGroupId,
    );
    if (redirectId) {
      navigate(getContactsGroupHref(redirectId), { replace: true });
    }
  }, [effectiveGroupId, isStandalone, navigate, selectedGroupId]);

  const selected = routedSlug
    ? resolveListItemFromSlug(contacts, routedSlug)
    : null;
  const {
    detailCollapsed,
    setDetailCollapsed,
    detailCollapseAnimating,
    panelEntityId: panelContactId,
    contentFaded,
    listFaded,
    workspaceFaded,
    expandOverlay: expandEntityOverlay,
    collapseOverlay: collapseEntityOverlay,
    hideDetail,
    showDetail,
    toggleDetail,
    closeOverlay: closeEntityOverlay,
  } = useEntityDetailOverlayTransition({
    overlayLayout,
    selectedId: selected?.id ?? null,
    routeHasSelection: Boolean(routedSlug),
    navigate,
    durations: CONTACT_DETAIL_OVERLAY_DURATIONS,
  });
  /** Keep a just-created contact at the top of the list until navigation leaves it. */
  const [pinnedContactId, setPinnedContactId] = useState<string | null>(null);
  const pinnedWasSelectedRef = useRef(false);
  const [workspaceTab, setWorkspaceTab] =
    useState<ContactExpandedWorkspaceTabId>("meetings");
  /** Profile card section — local so they never close workspace entities. */
  const [cardSection, setCardSection] = useState<ContactSectionId>("overview");
  const [portalSaveError, setPortalSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!pinnedContactId) {
      pinnedWasSelectedRef.current = false;
      return;
    }
    if (selected?.id === pinnedContactId) {
      pinnedWasSelectedRef.current = true;
      return;
    }
    if (pinnedWasSelectedRef.current) {
      setPinnedContactId(null);
    }
  }, [pinnedContactId, selected?.id]);

  useEffect(() => {
    if (!workspaceDetail) return;
    setWorkspaceTab(workspaceDetail.kind);
    setDetailCollapsed(false);
    setWorkspaceChatId(null);
  }, [setDetailCollapsed, workspaceDetail]);

  useEffect(() => {
    setWorkspaceChatId(null);
  }, [panelContactId, workspaceTab]);

  const details = panelContactId
    ? (workspace.contactDetails[panelContactId] ?? null)
    : null;

  const contactLatitude = asCoord(details?.latitude);
  const contactLongitude = asCoord(details?.longitude);
  const {
    mapImageSrc,
    mapLoading,
    mapHint,
    resolveLocation: resolveContactLocation,
  } = useMapboxEntityLocation({
    active: keepAliveActive,
    entityId: panelContactId,
    address: details
      ? {
          address: details.address ?? null,
          city: details.city ?? null,
          postalCode: details.postalCode ?? null,
          region: details.region ?? null,
          country: details.country ?? null,
        }
      : null,
    latitude: contactLatitude,
    longitude: contactLongitude,
    readCoordinates: (contactId) => workspace.contactDetails[contactId],
    patchCoordinates: (contactId, coordinates, { addressCleared }) =>
      workspace.patchContact(
        contactId,
        addressCleared ? { ...coordinates, timezone: null } : coordinates,
      ),
  });

  const activeSection = parseContactSectionId(sectionParam);
  // Standalone card tabs (Activity / Details) are local; URL section is for
  // deep links and org-scoped cards that still host Tasks/Letters.
  const profileSection: ContactSectionId = isStandalone
    ? cardSection
    : activeSection;
  const activityFeed = useCrmActivityFeed(
    "contact",
    panelContactId,
    keepAliveActive && Boolean(panelContactId) && profileSection === "overview",
  );
  const relationships = useContactRelationships(
    panelContactId,
    keepAliveActive && Boolean(panelContactId) && profileSection === "details",
  );
  const relationshipLabels = useCrmRelationshipLabels(
    keepAliveActive && Boolean(panelContactId) && profileSection === "details",
  );
  const {
    groupOptions,
    memberGroupIds,
    onMemberGroupIdsChange: handleMemberGroupIdsChange,
  } = useCrmSubjectGroupMembership({
    subjectType: "contact",
    subjectId: panelContactId,
    enabled: keepAliveActive && Boolean(panelContactId),
    notOnServerMessage:
      "This contact isn’t on the server yet, so it can’t join a group. Wait for sync or re-save the contact, then try again.",
  });
  const showPortalTab = useMemo(
    () =>
      groupOptions.some(
        (group) =>
          group.name.trim().toLowerCase() === "clients" &&
          memberGroupIds.includes(group.id),
      ),
    [groupOptions, memberGroupIds],
  );
  const showPortalLogsTab = useMemo(
    () => showPortalTab && Boolean(selected?.portalUsername?.trim()),
    [showPortalTab, selected?.portalUsername],
  );
  const contactProfileSections = useMemo(() => {
    if (isStandalone) {
      return resolveContactCardSections({
        showPortal: showPortalTab,
        showPortalLogs: showPortalLogsTab,
      });
    }
    if (!showPortalTab) {
      return CONTACT_SECTIONS.filter(
        (entry) => entry.id !== "portal" && entry.id !== "logs",
      );
    }
    if (!showPortalLogsTab) {
      return CONTACT_SECTIONS.filter((entry) => entry.id !== "logs");
    }
    return [...CONTACT_SECTIONS];
  }, [isStandalone, showPortalLogsTab, showPortalTab]);
  const portalProjects = useMemo(() => {
    const organizationId =
      details?.organizationId ?? selected?.organizationId ?? null;
    if (!organizationId) return [];
    return workspace.projects
      .filter((project) => project.organizationId === organizationId)
      .map((project) => ({
        id: project.id,
        name: project.name,
        key: project.key ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [details?.organizationId, selected?.organizationId, workspace.projects]);

  const sectionLabel =
    profileSection === "overview"
      ? null
      : (CONTACT_SECTIONS.find((entry) => entry.id === profileSection)?.label ??
        null);

  const selectedSlugValue = selected
    ? String(contactSlug(selected, contacts))
    : null;
  const contactCommunication = useMemo(() => {
    if (!selected) {
      return {
        emails: [] as const,
        supportTasks: [] as const,
        conversations: [] as const,
      };
    }
    return filterCommunicationForContact({
      contact: {
        id: selected.id,
        email: details?.email ?? selected.email,
        emails: normalizeContactEmails(details?.emails ?? selected.emails),
        phone: details?.phone ?? selected.phone,
        phones: normalizeContactPhones(details?.phones ?? selected.phones ?? []),
      },
      items: keepAliveFrozen ? [] : communicationItems,
      conversations: keepAliveFrozen ? [] : chatInbox.conversations,
    });
  }, [
    chatInbox.conversations,
    communicationItems,
    details?.email,
    details?.emails,
    details?.phone,
    details?.phones,
    keepAliveFrozen,
    selected,
  ]);
  const { onSendPortalInvite, onSendPortalPasswordReset } =
    useContactPortalEmailActions(selected?.id);
  const {
    logs: portalLogs,
    loading: portalLogsLoading,
    error: portalLogsError,
    refresh: refreshPortalLogs,
  } = useContactPortalLogs(showPortalLogsTab ? selected?.id : null);

  useEffect(() => {
    if (profileSection !== "logs") return;
    void refreshPortalLogs();
  }, [profileSection, refreshPortalLogs]);

  useEffect(() => {
    setAvatarOverride(undefined);
    setPortalAvatarOverride((current) => {
      if (current) URL.revokeObjectURL(current);
      return undefined;
    });
  }, [panelContactId]);

  // Keep Activity / Details / Portal in sync with the URL. Re-apply when the
  // selected contact changes so a later panelContactId resolve cannot wipe a
  // /portal (or /details) deep link back to Activity.
  useEffect(() => {
    if (!isStandalone || workspaceDetail) return;
    if (
      sectionParam === "details" ||
      sectionParam === "activity" ||
      sectionParam === "relationships"
    ) {
      setCardSection("details");
      return;
    }
    if (sectionParam === "portal") {
      setCardSection("portal");
      return;
    }
    if (sectionParam === "logs") {
      setCardSection("logs");
      return;
    }
    setCardSection("overview");
  }, [isStandalone, panelContactId, sectionParam, workspaceDetail]);

  useEffect(() => {
    if (showPortalTab) return;
    if (cardSection !== "portal") return;
    // Don't fight a /portal deep link while CRM groups are still loading.
    if (sectionParam === "portal") return;
    setCardSection("overview");
  }, [cardSection, sectionParam, showPortalTab]);

  useEffect(() => {
    if (showPortalLogsTab) return;
    if (cardSection !== "logs") return;
    if (sectionParam === "logs") return;
    setCardSection("overview");
  }, [cardSection, sectionParam, showPortalLogsTab]);

  // Invalid section segment → overview (standalone overlay / org detail).
  // Legacy `/activity` and `/relationships` → `/details`.
  // Standalone `/tasks`, `/letters`, `/meetings`, and `/emails` list roots →
  // expanded workspace tabs. Nested entity details stay on this page.
  useEffect(() => {
    if (!keepAliveActive) return;
    if (!selected || !sectionParam || !selectedSlugValue) return;
    if (sectionParam === "activity" || sectionParam === "relationships") {
      // Card-only remapping — never leave a nested task/letter/meeting/email.
      if (workspaceDetail) {
        setCardSection("details");
        return;
      }
      navigate(
        getScopedContactSectionHref(selectedSlugValue, "details", routeScope),
        { replace: true },
      );
      return;
    }
    if (
      isStandalone &&
      (sectionParam === "tasks" ||
        sectionParam === "letters" ||
        sectionParam === "meetings" ||
        sectionParam === "emails") &&
      !isContactSectionDetailPath(location.pathname, selectedSlugValue) &&
      !isContactScopedEntityDetailPath(location.pathname)
    ) {
      setWorkspaceTab(
        sectionParam as "meetings" | "tasks" | "letters" | "emails",
      );
      setDetailCollapsed(false);
      navigate(
        getContactOverlayHref(selectedSlugValue, {
          layout: "page",
          groupId: effectiveGroupId,
        }),
        { replace: true },
      );
      return;
    }
    if (sectionParam === "overview" || !isContactSectionId(sectionParam)) {
      // Workspace list roots are not ContactSectionIds.
      if (
        sectionParam === "meetings" ||
        sectionParam === "emails" ||
        sectionParam === "social"
      ) {
        return;
      }
      navigate(
        getScopedContactSectionHref(selectedSlugValue, "overview", routeScope),
        { replace: true },
      );
    }
  }, [
    effectiveGroupId,
    isStandalone,
    keepAliveActive,
    location.pathname,
    navigate,
    routeScope,
    sectionParam,
    selected,
    selectedGroupId,
    selectedSlugValue,
    setDetailCollapsed,
    workspaceDetail,
  ]);

  useDesktopSectionBreadcrumb(
    selected
      ? organizationRouteParam && organizationName
        ? [
            { label: "Organizations", href: "/organizations" },
            {
              label: organizationName,
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "overview",
              ),
            },
            {
              label: "Contacts",
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "contacts",
              ),
            },
            {
              label: selected.name,
              href:
                profileSection === "overview" || !selectedSlugValue
                  ? undefined
                  : getScopedContactSectionHref(
                      selectedSlugValue,
                      "overview",
                      routeScope,
                    ),
            },
            ...(sectionLabel ? [{ label: sectionLabel }] : []),
          ]
        : [
            {
              label: "Contacts",
              href: getContactsGroupHref(effectiveGroupId),
            },
            {
              label: selected.name,
              href:
                profileSection === "overview" || !selectedSlugValue
                  ? undefined
                  : getContactOverlayHref(selectedSlugValue, {
                      layout: overlayLayout,
                      groupId: effectiveGroupId,
                    }),
            },
            ...(sectionLabel ? [{ label: sectionLabel }] : []),
          ]
      : [
          {
            label: selectedGroupName ?? "Contacts",
          },
        ],
    { enabled: keepAliveActive && workspaceDetail == null },
  );

  const organizationOptions = useMemo(
    () =>
      organizations.map((org) => ({
        id: org.id,
        name: org.name,
        number: org.number,
        key: org.key,
        avatarSrc: organizationAvatarSrc[org.id] ?? null,
      })),
    [organizationAvatarSrc, organizations],
  );

  const overviewContacts = useMemo((): ContactListItem[] => {
    const mapped = contacts.map((contact) => ({
      ...contact,
      avatarSrc: contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null,
      groups: groupsByContactId.get(contact.id) ?? null,
    }));
    if (!effectiveGroupId) return mapped;
    // Same rule as portal client picker: direct contact members + contacts at
    // member organizations (Postgres CRM group membership via REST).
    return mapped.filter(
      (contact) =>
        groupMembers.contactIds.has(contact.id) ||
        (Boolean(contact.organizationId) &&
          groupMembers.organizationIds.has(contact.organizationId!)),
    );
  }, [
    contactAvatarSrc,
    contacts,
    effectiveGroupId,
    groupMembers.contactIds,
    groupMembers.organizationIds,
    groupsByContactId,
  ]);

  const handleDeleteContact = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Contact is required." };
    }
    try {
      await workspace.softDeleteContact(selected.id);
      navigate(
        isStandalone
          ? getContactsGroupHref(effectiveGroupId)
          : contactsListHref,
        { replace: true },
      );
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete contact.",
      };
    }
  }, [
    contactsListHref,
    effectiveGroupId,
    isStandalone,
    navigate,
    selected,
    workspace,
  ]);

  const contactLetters = useMemo(() => {
    if (!panelContactId) return [];
    return letters.filter((letter) => {
      if (letter.contactId === panelContactId) return true;
      const record = workspace.letterRecords[letter.id];
      return record?.contactId === panelContactId;
    });
  }, [letters, panelContactId, workspace.letterRecords]);

  const activityTimelineItems = useMemo(() => {
    if (!panelContactId) return activityFeed.items;
    const contactId = panelContactId;
    const fromFeed = activityFeed.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      occurredAt: item.occurredAt,
      body: item.body,
      bodyPreview: item.bodyPreview,
      meetingId: item.meetingId,
      meetingTitle: item.meetingTitle,
    }));
    // Same scoping as ContactTasksListView: assignee, linked, or Related.
    const completedTasks = tasks
      .filter((task) => {
        if (isHabitLinkedTask(task)) return false;
        if (!taskInvolvesContact(task, contactId)) return false;
        return migrateLegacyTaskStatus(task.status) === "completed";
      })
      .map((task) => {
        const occurredAt =
          typeof task.updatedAt === "number"
            ? new Date(task.updatedAt).toISOString()
            : new Date().toISOString();
        const taskRelation =
          task.assigneeId === contactId ? ("assigned" as const) : ("related" as const);
        return {
          id: `task:${task.id}`,
          kind: "task" as const,
          occurredAt,
          taskId: task.id,
          taskTitle: task.title,
          taskRelation,
        };
      });
    const letterItems = contactLetters
      .map((letter) => {
        const record = workspace.letterRecords[letter.id];
        const receivedAt = record?.receivedDate ?? null;
        const createdAt = record?.createdAt ?? null;
        const dueMs =
          typeof letter.dueDate === "number"
            ? letter.dueDate
            : letter.dueDate instanceof Date
              ? letter.dueDate.getTime()
              : null;
        const occurredAt =
          receivedAt ??
          createdAt ??
          (dueMs != null ? new Date(dueMs).toISOString() : null);
        if (!occurredAt) return null;
        return {
          id: `letter:${letter.id}`,
          kind: "letter" as const,
          occurredAt,
          letterId: letter.id,
          letterTitle: letter.title,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);

    return [...fromFeed, ...completedTasks, ...letterItems].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    );
  }, [
    activityFeed.items,
    contactLetters,
    panelContactId,
    tasks,
    workspace.letterRecords,
  ]);

  const openContact = useCallback(
    (contact: ContactListItem) => {
      const routeParam = getUniqueListItemRouteParam(contact, contacts);
      if (isStandalone) {
        navigate(
          getContactOverlayHref(routeParam, {
            groupId: effectiveGroupId,
          }),
        );
        return;
      }
      navigate(getScopedContactSectionHref(routeParam, "overview", routeScope));
    },
    [contacts, effectiveGroupId, isStandalone, navigate, routeScope],
  );

  const createAndOpenContact = useCallback(() => {
    void workspace
      .createContact({ firstName: "New", lastName: "contact" })
      .then(async (created) => {
        if (effectiveGroupId) {
          try {
            await addCrmGroupMemberWithRetry(client, powerSync, {
              groupId: effectiveGroupId,
              subjectType: "contact",
              subjectId: created.id,
            });
            notifyCrmGroupsChanged();
          } catch (error) {
            console.warn("[desktop] assign contact to group failed", error);
          }
        }
        setPinnedContactId(created.id);
        // Prefer id-based navigation so we do not depend on list membership
        // catching up with the optimistic create (number may still be null).
        navigate(
          getContactOverlayHref(
            getUniqueListItemRouteParam(created, [
              ...contacts,
              { id: created.id, key: created.key, number: created.number },
            ]),
            {
              groupId: effectiveGroupId,
            },
          ),
        );
      })
      .catch((error) => {
        console.warn("[desktop] create contact failed", error);
      });
  }, [client, contacts, effectiveGroupId, navigate, powerSync, workspace]);

  const overlayHref = useCallback(
    (layout: ContactOverlayLayout) =>
      selectedSlugValue
        ? getContactOverlayHref(selectedSlugValue, {
            section: cardSection === "overview" ? undefined : cardSection,
            layout,
            groupId: effectiveGroupId,
          })
        : null,
    [cardSection, effectiveGroupId, selectedSlugValue],
  );

  const expandOverlay = useCallback(() => {
    const href = overlayHref("page");
    if (href) expandEntityOverlay(href);
  }, [expandEntityOverlay, overlayHref]);

  const collapseOverlay = useCallback(() => {
    const href = overlayHref("panel");
    if (!href) return;
    // Keep nested entity URL when collapsing chrome; only shrink layout.
    if (workspaceDetail) {
      setDetailCollapsed(false);
      return;
    }
    collapseEntityOverlay(href);
  }, [collapseEntityOverlay, overlayHref, setDetailCollapsed, workspaceDetail]);

  const closeOverlay = useCallback(() => {
    closeEntityOverlay(getContactsGroupHref(effectiveGroupId));
  }, [closeEntityOverlay, effectiveGroupId]);

  const panelContact =
    panelContactId == null
      ? null
      : (contacts.find((entry) => entry.id === panelContactId) ??
        (selected?.id === panelContactId ? selected : null));

  useEffect(() => {
    if (!keepAliveActive || !isStandalone || !selected) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        // Nested detail → workspace lists; expanded → narrow card; narrow → leave.
        if (workspaceDetail && selectedSlugValue) {
          navigate(
            getContactOverlayHref(selectedSlugValue, {
              layout: "page",
              groupId: effectiveGroupId,
            }),
          );
        } else if (overlayLayout === "page") {
          collapseOverlay();
        } else {
          closeOverlay();
        }
        return;
      }

      if (
        overlayLayout === "page" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const tabIndex = parseSectionTabIndex(event.key);
        if (tabIndex != null) {
          if (!shouldHandleGlobalShortcut(event)) return;
          const cardCount = contactProfileSections.length;
          // 1…N card sections (Activity / Details / Portal / Logs).
          if (tabIndex < cardCount) {
            const next = contactProfileSections[tabIndex]?.id;
            if (!next) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            setCardSection(next);
            if (!workspaceDetail && selectedSlugValue) {
              navigate(
                getContactOverlayHref(selectedSlugValue, {
                  section: next === "overview" ? undefined : next,
                  layout: "page",
                  groupId: effectiveGroupId,
                }),
                { replace: true },
              );
            }
            return;
          }
          // N+1 = expand (already expanded — no-op).
          const workspaceStart =
            contactExpandedWorkspaceDigitStartIndex(cardCount);
          if (tabIndex < workspaceStart) return;
          // N+2… = Meetings / Emails / Tasks / Letters / Social.
          const tab =
            CONTACT_EXPANDED_WORKSPACE_TAB_IDS[tabIndex - workspaceStart];
          if (!tab) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          setWorkspaceTab(tab);
          if (workspaceDetail && selectedSlugValue) {
            navigate(
              getContactOverlayHref(selectedSlugValue, {
                layout: "page",
                groupId: effectiveGroupId,
              }),
            );
          }
          return;
        }
      }

      if (!isAgentPanelToggleShortcut(event)) return;
      // Nested task owns `]` for the agent/chat panel.
      if (workspaceDetail) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleDetail();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    closeOverlay,
    collapseOverlay,
    contactProfileSections,
    toggleDetail,
    effectiveGroupId,
    isStandalone,
    keepAliveActive,
    navigate,
    overlayLayout,
    selected,
    selectedSlugValue,
    workspaceDetail,
  ]);

  function handleSectionChange(next: ContactSectionId) {
    if (!selectedSlugValue) return;

    // Activity / Details belong to the right-hand card only — never change the
    // workspace URL (that would close an open task / letter / meeting / email).
    if (isStandalone && isContactCardSectionId(next)) {
      setCardSection(next);
      if (workspaceDetail) return;
      navigate(
        getContactOverlayHref(selectedSlugValue, {
          section: next === "overview" ? undefined : next,
          layout: overlayLayout,
          groupId: effectiveGroupId,
        }),
        { replace: true },
      );
      return;
    }

    if (isStandalone) {
      navigate(
        getContactOverlayHref(selectedSlugValue, {
          section: next === "overview" ? undefined : next,
          layout: overlayLayout,
          groupId: effectiveGroupId,
        }),
        { replace: true },
      );
      return;
    }
    navigate(getScopedContactSectionHref(selectedSlugValue, next, routeScope), {
      replace: true,
    });
  }

  function renderSection(sectionId: ContactSectionId) {
    if (!selected || !selectedSlugValue) return null;
    const contact = selected;
    const contactRouteSlug = selectedSlugValue;

    if (sectionId === "portal") {
      return (
        <ContactPortalTabView
          settings={contact.portalSettings as ContactPortalSettings | null | undefined}
          portalUsername={contact.portalUsername}
          portalPasswordSet={Boolean(contact.portalPasswordSet)}
          projects={portalProjects}
          emails={getContactEmailAddresses({
            email: details?.email ?? contact.email,
            emails: details?.emails ?? contact.emails,
          }).map((address) => ({ address }))}
          reservedPortalUsernames={contacts
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
              // `portal_password_hash` can clobber the hash we just set (UI shows
              // success from the REST 200 while login still uses the old password).
              if (portalPassword !== null) {
                await client.requestJson(
                  `/api/v1/contacts/${encodeURIComponent(contact.id)}`,
                  {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      portalPassword,
                      // Never clear username during a password-only confirm.
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
    }

    if (sectionId === "logs") {
      return (
        <div className="contact-portal-logs-tab entity-overview__details flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <ContactPortalLogsTabView
            logs={portalLogs}
            loading={portalLogsLoading}
            error={portalLogsError}
          />
        </div>
      );
    }

    if (sectionId === "tasks") {
      return (
        <ContactTasksListView
          contactId={contact.id}
          tasks={tasks}
          onSelectTask={(taskId) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (!task) {
              navigate(`/tasks/${taskId}`);
              return;
            }
            navigate(
              getScopedContactTaskHref(
                task,
                contact,
                workspace.projects,
                routeScope,
                contactRouteSlug,
              ),
            );
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
            const patches = taskReorderPatches(tasks, request);
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

    if (sectionId === "letters") {
      return (
        <ScopedLettersListView
          letters={contactLetters}
          onSelectLetter={(letter) => {
            if (letter.number == null) return;
            navigate(
              getScopedContactLetterHref(
                contactRouteSlug,
                letter.number,
                routeScope,
              ),
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
          onCompose={(status) => {
            const params = new URLSearchParams({
              contactId: contact.id,
              status,
            });
            if (contact.organizationId) {
              params.set("organizationId", contact.organizationId);
            }
            navigate(
              `${getScopedContactLetterHref(contactRouteSlug, "new", routeScope)}?${params.toString()}`,
            );
          }}
        />
      );
    }

    return null;
  }

  function contactWorkspaceBreadcrumbPrefix(
    sectionLabel: string,
    sectionHref: string,
  ): { label: string; href?: string }[] {
    if (!selected || !selectedSlugValue) return [];
    return [
      { label: "Contacts", href: getContactsGroupHref(effectiveGroupId) },
      {
        label: selected.name,
        href: getContactOverlayHref(selectedSlugValue, {
          layout: "page",
          groupId: effectiveGroupId,
        }),
      },
      { label: sectionLabel, href: sectionHref },
    ];
  }

  function renderWorkspaceEntityDetail(detail: ContactScopedEntityDetail) {
    if (!selected || !selectedSlugValue) return null;
    const contactRouteSlug = selectedSlugValue;

    if (detail.kind === "meetings") {
      const backHref = getScopedContactMeetingsListHref(
        contactRouteSlug,
        routeScope,
      );
      return (
        <MeetingDetailPage
          meetingRouteParam={detail.id}
          backHref={backHref}
          breadcrumbItems={contactWorkspaceBreadcrumbPrefix(
            "Meetings",
            backHref,
          )}
        />
      );
    }

    if (detail.kind === "tasks") {
      const backHref = getScopedContactSectionHref(
        contactRouteSlug,
        "tasks",
        routeScope,
      );
      return (
        <TaskDetailPage
          taskRouteParam={detail.id}
          backHref={backHref}
          breadcrumbItems={contactWorkspaceBreadcrumbPrefix("Tasks", backHref)}
        />
      );
    }

    if (detail.kind === "letters") {
      const backHref = getScopedContactSectionHref(
        contactRouteSlug,
        "letters",
        routeScope,
      );
      return (
        <LettersPage
          letterRouteParam={detail.id}
          backHref={backHref}
          breadcrumbItems={contactWorkspaceBreadcrumbPrefix("Letters", backHref)}
          disableAutoSelectFirst
        />
      );
    }

    if (detail.kind === "emails") {
      const backHref = getScopedContactEmailsListHref(
        contactRouteSlug,
        routeScope,
      );
      return (
        <EmailPage
          embedInboxId={detail.inboxId}
          embedMessageId={detail.messageId}
          embedDraftId={detail.draftId}
          breadcrumbItems={contactWorkspaceBreadcrumbPrefix(
            "Messages",
            backHref,
          )}
        />
      );
    }

    return null;
  }

  const workspaceTabContext = {
    selected,
    selectedSlugValue,
    contactCommunication,
    tasks,
    projects: workspace.projects,
    routeScope,
    navigate,
    selectConversation: chatInbox.selectConversation,
  };
  const workspaceTabContextRef = useRef(workspaceTabContext);
  workspaceTabContextRef.current = workspaceTabContext;
  const workspaceTabHandlers = useMemo<ContactWorkspaceTabPanelHandlers>(
    () => ({
      onSelectMeeting: (meetingId) => {
        const { selectedSlugValue, routeScope, navigate } =
          workspaceTabContextRef.current;
        if (!selectedSlugValue) return;
        navigate(
          getScopedContactMeetingHref(selectedSlugValue, meetingId, routeScope),
        );
      },
      onSelectChat: (conversationId) => {
        setWorkspaceChatId(conversationId);
        void workspaceTabContextRef.current.selectConversation(conversationId);
      },
      onSelectEmail: (emailId) => {
        const {
          selectedSlugValue,
          contactCommunication,
          routeScope,
          navigate,
        } = workspaceTabContextRef.current;
        if (!selectedSlugValue) return;
        const item = contactCommunication.emails.find(
          (entry) => entry.id === emailId,
        );
        if (!item) return;
        navigate(
          getScopedContactEmailHref(
            selectedSlugValue,
            {
              inboxId: item.inboxId,
              id: item.draftId?.trim() || item.messageId,
              kind: item.draftId ? "draft" : "message",
            },
            routeScope,
          ),
        );
      },
      onSelectSupport: (supportId) => {
        const {
          selected,
          selectedSlugValue,
          tasks,
          projects,
          routeScope,
          navigate,
        } = workspaceTabContextRef.current;
        if (!selectedSlugValue || !selected) return;
        const task = tasks.find((entry) => entry.id === supportId);
        if (!task) {
          navigate(`/tasks/${supportId}`);
          return;
        }
        navigate(
          getScopedContactTaskHref(
            task,
            selected,
            projects,
            routeScope,
            selectedSlugValue,
          ),
        );
      },
    }),
    [],
  );

  const contactPropertyHandlers = useContactPropertyHandlers({
    client,
    contactId: (panelContact ?? selected)?.id ?? null,
    patchContact: workspace.patchContact,
    createOrganization: workspace.createOrganization,
    resolveLocation: resolveContactLocation,
    setAvatarOverride,
  });

  function renderContactDetail() {
    const contact = panelContact ?? selected;
    if (!contact) return null;
    const contactRouteSlug = String(contactSlug(contact, contacts));
    const syncedAvatarSrc = contactAvatarSrc[contact.id] ?? null;
    const avatarSrc =
      avatarOverride !== undefined ? avatarOverride : syncedAvatarSrc;

    return (
      <ContactDetailView
        contact={{
          id: contact.id,
          name: contact.name,
          firstName: contact.firstName ?? null,
          lastName: contact.lastName ?? null,
          displayId:
            contact.number != null ? `C-${contact.number}` : contact.key,
          email: details?.email ?? null,
          emails: normalizeContactEmails(details?.emails ?? contact.emails),
          phone: details?.phone ?? contact.phone ?? null,
          phones: normalizeContactPhones(
            details?.phones ?? contact.phones ?? [],
          ),
          title: details?.title ?? null,
          address: details?.address ?? null,
          city: details?.city ?? null,
          postalCode: details?.postalCode ?? null,
          country: details?.country ?? null,
          region: details?.region ?? null,
          timezone: details?.timezone ?? null,
          latitude: contactLatitude,
          longitude: contactLongitude,
          organizationId: contact.organizationId ?? details?.organizationId,
          organizationName: contact.organizationName,
          summary: details?.summary ?? null,
          socialAccounts: normalizeContactSocialAccounts(
            details?.socialAccounts,
          ),
          facebookMessengerId:
            details?.facebookMessengerId ??
            contact.facebookMessengerId ??
            null,
          xUserId: details?.xUserId ?? contact.xUserId ?? null,
          birthday: details?.birthday ?? contact.birthday ?? null,
          languages: coerceContactLanguages(
            details?.languages ?? contact.languages ?? [],
          ),
        }}
        organizationOptions={organizationOptions}
        groupOptions={groupOptions}
        memberGroupIds={memberGroupIds}
        onMemberGroupIdsChange={handleMemberGroupIdsChange}
        sections={contactProfileSections}
        section={profileSection}
        onSectionChange={handleSectionChange}
        renderSection={renderSection}
        relationshipsSlot={
          <ContactRelationshipsListView
            items={relationships.items}
            loading={relationships.loading}
            error={relationships.error}
            relationshipLabels={relationshipLabels.labels}
            contactOptions={contacts
              .filter((entry) => entry.id !== contact.id)
              .map((entry) => ({
                id: entry.id,
                name: entry.name,
                avatarSrc:
                  contactAvatarSrc[entry.id] ?? entry.avatarSrc ?? null,
              }))}
            onSelectContact={(contactId) => {
              const target = contacts.find((entry) => entry.id === contactId);
              if (!target) return;
              openContact(target);
            }}
            onAdd={relationships.add}
            onRemove={relationships.remove}
            onCreateLabel={relationshipLabels.createLabel}
            onUpdateLabel={relationshipLabels.updateLabel}
            onDeleteLabel={relationshipLabels.deleteLabel}
          />
        }
        activitySlot={
          <CrmActivityFeedView
            items={activityTimelineItems}
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
            onCreateLetter={() => {
              void workspace
                .createLetter({
                  title: "New letter",
                  contactId: contact.id,
                  organizationId: contact.organizationId ?? null,
                  status: "triage",
                })
                .then((created) => {
                  const href = resolveLetterDetailHref({
                    id: created.id,
                    number: created.number,
                    listBaseHref: getScopedContactSectionHref(
                      contactRouteSlug,
                      "letters",
                      routeScope,
                    ),
                  });
                  navigate(href);
                });
            }}
            onOpenMeeting={(meetingId) =>
              navigate(
                getScopedContactMeetingHref(
                  contactRouteSlug,
                  meetingId,
                  routeScope,
                ),
              )
            }
            onOpenTask={(taskId) => {
              const task = tasks.find((entry) => entry.id === taskId);
              if (!task) {
                navigate(`/tasks/${taskId}`);
                return;
              }
              navigate(
                getScopedContactTaskHref(
                  task,
                  contact,
                  workspace.projects,
                  routeScope,
                  contactRouteSlug,
                ),
              );
            }}
            onOpenLetter={(letterId) => {
              const letter = contactLetters.find(
                (entry) => entry.id === letterId,
              );
              if (!letter || letter.number == null) return;
              navigate(
                getScopedContactLetterHref(
                  contactRouteSlug,
                  letter.number,
                  routeScope,
                ),
              );
            }}
          />
        }
        onCreateOrganizationFromQuery={
          contactPropertyHandlers.onCreateOrganizationFromQuery
        }
        overviewHeaderAccessory={
          <AvatarUpload
            displayName={contact.name}
            avatarSrc={avatarSrc}
            shape="cover"
            showHint={false}
            onUpload={contactPropertyHandlers.onUploadAvatar}
            onRemove={contactPropertyHandlers.onRemoveAvatar}
          />
        }
        onSaveFirstName={contactPropertyHandlers.onSaveFirstName}
        onSaveLastName={contactPropertyHandlers.onSaveLastName}
        onSaveDetails={contactPropertyHandlers.onSaveDetails}
        onAfterLocationSave={contactPropertyHandlers.onAfterLocationSave}
        mapImageSrc={mapImageSrc}
        mapLoading={mapLoading}
        mapHint={mapHint}
      />
    );
  }

  const contactTabTitle = selected
    ? formatContactDisplayName(
        selected.firstName ?? "",
        selected.lastName,
      ) || selected.name
    : "Contacts";
  const contactTabAvatarSrc = selected
    ? (avatarOverride !== undefined
        ? avatarOverride
        : (contactAvatarSrc[selected.id] ?? null))
    : null;

  // Org-scoped: keep full-page detail (org list stays in left panel).
  if (!isStandalone) {
    if (!routedSlug) {
      return (
        <EntityDetailLayout
          sectionLabel="Contacts"
          title={null}
          resolving={contacts.length > 0}
        />
      );
    }
    if (!selected || !selectedSlugValue) {
      return (
        <EntityDetailLayout
          sectionLabel="Contacts"
          title={null}
          emptyMessage="Contact not found."
        />
      );
    }
    return (
      <>
        {keepAliveActive ? (
          <>
            <RegisterPageTitle
              active={keepAliveActive}
              href={location.pathname}
              title={contactTabTitle}
            />
            <RegisterPageIcon
              active={keepAliveActive}
              href={location.pathname}
              icon={contactTabAvatarSrc}
            />
            {activeSection === "overview" ? (
              <RegisterEntityDeleteAction
                entityLabel={`contact "${selected.name}"`}
                onDelete={handleDeleteContact}
              />
            ) : null}
          </>
        ) : null}
        {renderContactDetail()}
      </>
    );
  }

  // Standalone: list + resizable right detail rail (hide/show with ]).
  // Only treat as "not found" when the slug matches nothing and we aren't
  // still showing a lagged panel contact (switch fade / brief resolve miss).
  if (routedSlug && !selected && !panelContact) {
    return (
      <div
        className="contacts-page journal-day-layout desktop-journal-day-layout"
        data-content-detail
        data-detail-split
      >
        <div className="journal-day-layout__main">
          <ContactsOverviewView
            contacts={overviewContacts}
            emptyMessage={
              selectedGroupId
                ? "No contacts in this group yet."
                : "No contacts yet."
            }
            pinnedContactId={pinnedContactId}
            typeToFilterEnabled={keepAliveActive}
            onSelect={(contact) => openContact(contact)}
            onAdd={createAndOpenContact}
          />
        </div>
        <EntityDetailLayout
          sectionLabel="Contacts"
          title={null}
          emptyMessage="Contact not found."
        />
      </div>
    );
  }

  const panelOpen = Boolean(panelContact ?? selected);

  // Same rule as organizations: never leave the catalog at opacity 0 after
  // breadcrumb / Escape close the overlay.
  const listExpandFaded = listFaded && panelOpen;

  return (
    <div
      className={[
        "contacts-page",
        "journal-day-layout",
        "desktop-journal-day-layout",
        panelOpen && detailCollapsed ? "is-calendar-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-split
      data-calendar-collapsed={
        panelOpen && detailCollapsed ? "true" : "false"
      }
    >
      {keepAliveActive && selected ? (
        <>
          <RegisterPageTitle
            active={keepAliveActive}
            href={location.pathname}
            title={
              overlayLayout === "page" ? contactTabTitle : "Contacts"
            }
          />
          <RegisterPageIcon
            active={keepAliveActive}
            href={location.pathname}
            icon={
              overlayLayout === "page" ? contactTabAvatarSrc : null
            }
          />
          {activeSection === "overview" ? (
            <RegisterEntityDeleteAction
              entityLabel={`contact "${selected.name}"`}
              onDelete={handleDeleteContact}
            />
          ) : null}
        </>
      ) : keepAliveActive ? (
        <>
          <RegisterPageTitle
            active={keepAliveActive}
            href={location.pathname}
            title="Contacts"
          />
          <RegisterPageIcon
            active={keepAliveActive}
            href={location.pathname}
            icon={null}
          />
        </>
      ) : null}

      <div
        className={[
          "journal-day-layout__main",
          listExpandFaded ? "is-expand-faded" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ContactsOverviewView
          contacts={overviewContacts}
          emptyMessage={
            selectedGroupId
              ? "No contacts in this group yet."
              : "No contacts yet."
          }
          selectedId={selected?.id ?? null}
          pinnedContactId={pinnedContactId}
          typeToFilterEnabled={keepAliveActive}
          onSelect={(contact) => openContact(contact)}
          onAdd={createAndOpenContact}
        />
      </div>

      <ContactDetailOverlay
        open={panelOpen}
        collapsed={detailCollapsed}
        collapseAnimating={detailCollapseAnimating}
        contentFaded={contentFaded}
        workspaceFaded={workspaceFaded}
        overlayLayout={overlayLayout}
        title={panelContact?.name ?? selected?.name ?? "Contact"}
        onExpand={expandOverlay}
        onCollapse={collapseOverlay}
        onHide={hideDetail}
        onShow={showDetail}
        hideWorkspaceTabs={Boolean(workspaceDetail) || Boolean(workspaceChatId)}
        workspaceTab={workspaceTab}
        onWorkspaceTabChange={(tab) => {
          setWorkspaceTab(tab);
          setWorkspaceChatId(null);
          if (workspaceDetail && selectedSlugValue) {
            navigate(
              getContactOverlayHref(selectedSlugValue, {
                layout: "page",
                groupId: effectiveGroupId,
              }),
            );
          }
        }}
        renderWorkspaceTab={(tab) => {
          if (workspaceChatId) {
            return (
              <div className="contact-communication-thread">
                <button
                  type="button"
                  className="contact-communication-thread__back"
                  onClick={() => {
                    setWorkspaceChatId(null);
                    chatInbox.selectConversation(null);
                  }}
                >
                  Back to Messages
                </button>
                <CommunicationChatView
                  pane="thread"
                  conversations={chatInbox.conversations}
                  selectedId={workspaceChatId}
                  detail={chatInbox.detail}
                  loading={chatInbox.loading}
                  detailLoading={chatInbox.detailLoading}
                  error={chatInbox.error}
                  typingIds={chatInbox.typingIds}
                  onSelect={(id) => {
                    void chatInbox.selectConversation(id);
                  }}
                  onSend={chatInbox.sendMessage}
                  onTypingChange={chatInbox.setTyping}
                  resolveAvatarSrc={() =>
                    selected ? (contactAvatarSrc[selected.id] ?? null) : null
                  }
                />
              </div>
            );
          }
          if (workspaceDetail) {
            return renderWorkspaceEntityDetail(workspaceDetail);
          }
          if ((tab === "meetings" || tab === "emails") && selected) {
            return (
              <ContactWorkspaceTabPanel
                tab={tab}
                contactId={selected.id}
                meetings={meetings}
                communication={contactCommunication}
                contactAvatarSrc={contactAvatarSrc}
                handlers={workspaceTabHandlers}
              />
            );
          }
          if (tab === "tasks") return renderSection("tasks");
          if (tab === "letters") return renderSection("letters");
          return null;
        }}
      >
        {renderContactDetail()}
      </ContactDetailOverlay>
    </div>
  );
}
