import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  coerceContactLanguages,
  formatContactDisplayName,
  getContactEmailAddresses,
  taskInvolvesContact,
  type MapboxGeocodeResult,
  type MapboxSettings,
} from "@backsteros/contracts";

import {
  AvatarUpload,
  ContactDetailOverlay,
  ContactDetailView,
  ContactEmailsListView,
  ContactMeetingsListView,
  ContactRelationshipsListView,
  ContactTasksListView,
  ContactsOverviewView,
  CONTACT_CARD_SECTIONS,
  CONTACT_DETAIL_COLLAPSE_DURATION_MS,
  CONTACT_DETAIL_CONTENT_FADE_MS,
  CONTACT_DETAIL_EXPAND_FADE_MS,
  CONTACT_EXPANDED_WORKSPACE_TAB_IDS,
  CONTACT_SECTIONS,
  ContactPortalTabView,
  CrmActivityFeedView,
  EntityDetailLayout,
  RegisterEntityDeleteAction,
  RegisterPageIcon,
  RegisterPageTitle,
  ScopedLettersListView,
  formatContactAddressLine,
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
  parseContactOverlayLayout,
  parseContactScopedEntityDetail,
  parseContactSectionId,
  parseCrmGroupId,
  parseSectionTabIndex,
  requestOpenComposeModal,
  resolveListItemFromSlug,
  resolveCountryOption,
  shouldHandleGlobalShortcut,
  type ContactExpandedWorkspaceTabId,
  type ContactListItem,
  type ContactLocationParts,
  type ContactOverviewDetails,
  type ContactOverlayLayout,
  type ContactRouteScope,
  type ContactScopedEntityDetail,
  type ContactSectionId,
  type TaskStatus,
  taskReorderPatches,
} from "@backsteros/ui";

import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopApi } from "../lib/api-context";
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
  useCrmGroupsForSubject,
  useCrmRelationshipLabels,
} from "../lib/use-crm-data";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";
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

function asCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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
  const agentMail = useAgentMail();
  const keepAliveFrozen = useKeepAliveFrozen();
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);
  const [mapboxConfigured, setMapboxConfigured] = useState(false);
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const contacts = workspace.contacts;
  const { organizations, allTasks: tasks, letters, meetings } = workspace;
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : contacts,
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
    workspaceDetail != null
      ? "page"
      : parseContactOverlayLayout(location.searchStr ?? "");
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
    if (
      !isStandalone ||
      !selectedGroupId ||
      !effectiveGroupId ||
      selectedGroupId === effectiveGroupId
    ) {
      return;
    }
    navigate(getContactsGroupHref(effectiveGroupId), { replace: true });
  }, [
    effectiveGroupId,
    isStandalone,
    navigate,
    selectedGroupId,
  ]);

  const selected = routedSlug
    ? resolveListItemFromSlug(contacts, routedSlug)
    : null;
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailCollapseAnimating, setDetailCollapseAnimating] = useState(false);
  const detailCollapseAnimTimerRef = useRef<number | null>(null);
  const detailCollapseRafRef = useRef<number | null>(null);
  const detailCloseNavTimerRef = useRef<number | null>(null);
  const detailCollapsedRef = useRef(detailCollapsed);
  detailCollapsedRef.current = detailCollapsed;
  /** Contact id shown in the panel — lags `selected` during switch fade. */
  const [panelContactId, setPanelContactId] = useState<string | null>(
    selected?.id ?? null,
  );
  const [contentFaded, setContentFaded] = useState(false);
  const contentFadeTokenRef = useRef(0);
  /** Contacts list opacity during expand/collapse to page workspace. */
  const [listFaded, setListFaded] = useState(
    () => overlayLayout === "page",
  );
  /** Expanded workspace opacity during expand/collapse. */
  const [workspaceFaded, setWorkspaceFaded] = useState(false);
  const expandAnimTokenRef = useRef(0);
  const expandAnimTimerRef = useRef<number | null>(null);
  const pendingWorkspaceFadeInRef = useRef(false);
  const pendingListFadeInRef = useRef(false);
  /** Keep a just-created contact at the top of the list until navigation leaves it. */
  const [pinnedContactId, setPinnedContactId] = useState<string | null>(null);
  const pinnedWasSelectedRef = useRef(false);
  const [workspaceTab, setWorkspaceTab] =
    useState<ContactExpandedWorkspaceTabId>("meetings");
  /** Activity / Details / Portal on the profile card — local so they never close workspace entities. */
  const [cardSection, setCardSection] = useState<
    "overview" | "details" | "portal"
  >("overview");
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
  }, [workspaceDetail]);

  const details = panelContactId
    ? (workspace.contactDetails[panelContactId] ?? null)
    : null;

  const contactLatitude = asCoord(details?.latitude);
  const contactLongitude = asCoord(details?.longitude);

  useEffect(() => {
    if (!keepAliveActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<MapboxSettings>(
          "/api/v1/settings/mapbox",
        );
        if (!cancelled) setMapboxConfigured(body.accessTokenConfigured);
      } catch {
        if (!cancelled) setMapboxConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, keepAliveActive]);

  useEffect(() => {
    setGeocodeFailed(false);
  }, [selected?.id]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (
      contactLatitude == null ||
      contactLongitude == null ||
      !mapboxConfigured
    ) {
      setMapImageSrc((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setMapLoading(false);
      return;
    }

    setMapLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          lat: String(contactLatitude),
          lng: String(contactLongitude),
          width: "640",
          height: "320",
        });
        const blob = await client.requestBinary(
          `/api/v1/mapbox/static-map?${params}`,
        );
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
        setMapHint(null);
      } catch {
        if (cancelled) return;
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        setMapHint("Couldn’t load the map image.");
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, contactLatitude, contactLongitude, mapboxConfigured]);

  useEffect(() => {
    const addressLine = formatContactAddressLine({
      address: details?.address ?? null,
      city: details?.city ?? null,
      postalCode: details?.postalCode ?? null,
      region: details?.region ?? null,
      country: details?.country ?? null,
    });
    if (contactLatitude != null && contactLongitude != null) {
      setMapHint(null);
      return;
    }
    if (!addressLine) {
      setMapHint(null);
      return;
    }
    if (!mapboxConfigured) {
      setMapHint("Add a Mapbox token in Settings → Mapbox to show this on a map.");
      return;
    }
    if (geocodeFailed) {
      setMapHint("Couldn’t locate this address.");
      return;
    }
    setMapHint(null);
  }, [
    contactLatitude,
    contactLongitude,
    details?.address,
    details?.city,
    details?.country,
    details?.region,
    details?.postalCode,
    geocodeFailed,
    mapboxConfigured,
  ]);

  const resolveContactLocation = useCallback(
    async (contactId: string, parts: ContactLocationParts) => {
      const addressLine = formatContactAddressLine(parts);
      if (!addressLine) {
        setGeocodeFailed(false);
        await workspace.patchContact(contactId, {
          latitude: null,
          longitude: null,
        });
        return;
      }
      if (!mapboxConfigured) {
        setGeocodeFailed(false);
        return;
      }
      try {
        const params = new URLSearchParams({ q: addressLine });
        const countryCode = resolveCountryOption(parts.country)?.code;
        if (countryCode) {
          params.set("country", countryCode);
        }
        const body = await client.requestJson<{
          result: MapboxGeocodeResult | null;
        }>(`/api/v1/mapbox/geocode?${params}`);
        if (!body.result) {
          setGeocodeFailed(true);
          await workspace.patchContact(contactId, {
            latitude: null,
            longitude: null,
          });
          return;
        }
        setGeocodeFailed(false);
        await workspace.patchContact(contactId, {
          latitude: body.result.latitude,
          longitude: body.result.longitude,
        });
      } catch {
        setGeocodeFailed(true);
      }
    },
    [client, mapboxConfigured, workspace],
  );

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
  const crmGroups = useCrmGroupsForSubject(
    "contact",
    panelContactId,
    keepAliveActive && Boolean(panelContactId),
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
  const showPortalTab = useMemo(
    () =>
      groupOptions.some(
        (group) =>
          group.name.trim().toLowerCase() === "clients" &&
          memberGroupIds.includes(group.id),
      ),
    [groupOptions, memberGroupIds],
  );
  const contactProfileSections = useMemo(() => {
    if (isStandalone) {
      return resolveContactCardSections({ showPortal: showPortalTab });
    }
    return showPortalTab
      ? [...CONTACT_SECTIONS]
      : CONTACT_SECTIONS.filter((entry) => entry.id !== "portal");
  }, [isStandalone, showPortalTab]);
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
  const handleMemberGroupIdsChange = useCallback(
    (nextIds: string[]) => {
      const previous = new Set(memberGroupIds);
      const next = new Set(nextIds);
      void (async () => {
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
          const friendly =
            /subject not found|member subject|404/i.test(message)
              ? "This contact isn’t on the server yet, so it can’t join a group. Wait for sync or re-save the contact, then try again."
              : message;
          window.alert(friendly);
          await crmGroups.reload();
        }
      })();
    },
    [crmGroups, memberGroupIds],
  );
  const sectionLabel =
    profileSection === "overview"
      ? null
      : (CONTACT_SECTIONS.find((entry) => entry.id === profileSection)?.label ??
        null);

  const selectedSlugValue = selected
    ? String(contactSlug(selected, contacts))
    : null;

  useEffect(() => {
    setAvatarOverride(undefined);
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
    setCardSection("overview");
  }, [isStandalone, panelContactId, sectionParam, workspaceDetail]);

  useEffect(() => {
    if (showPortalTab) return;
    if (cardSection !== "portal") return;
    // Don't fight a /portal deep link while CRM groups are still loading.
    if (sectionParam === "portal") return;
    setCardSection("overview");
  }, [cardSection, sectionParam, showPortalTab]);

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
    isStandalone,
    keepAliveActive,
    location.pathname,
    navigate,
    routeScope,
    sectionParam,
    selected,
    selectedGroupId,
    selectedSlugValue,
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
    isStandalone,
    navigate,
    selected,
    selectedGroupId,
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
    [contacts, isStandalone, navigate, routeScope, selectedGroupId],
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
  }, [client, contacts, navigate, powerSync, selectedGroupId, workspace]);

  const expandOverlay = useCallback(() => {
    if (!selectedSlugValue) return;
    if (overlayLayout === "page") return;
    setDetailCollapsed(false);
    const token = ++expandAnimTokenRef.current;
    pendingListFadeInRef.current = false;
    pendingWorkspaceFadeInRef.current = true;
    setListFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setWorkspaceFaded(true);
      navigate(
        getContactOverlayHref(selectedSlugValue, {
          section: cardSection === "overview" ? undefined : cardSection,
          layout: "page",
          groupId: effectiveGroupId,
        }),
        { replace: true },
      );
    }, CONTACT_DETAIL_EXPAND_FADE_MS);
  }, [
    cardSection,
    navigate,
    overlayLayout,
    selectedGroupId,
    selectedSlugValue,
  ]);

  const collapseOverlay = useCallback(() => {
    if (!selectedSlugValue) return;
    setDetailCollapsed(false);
    // Keep nested entity URL when collapsing chrome; only shrink layout.
    if (workspaceDetail) {
      return;
    }
    if (overlayLayout !== "page") {
      navigate(
        getContactOverlayHref(selectedSlugValue, {
          section: cardSection === "overview" ? undefined : cardSection,
          layout: "panel",
          groupId: effectiveGroupId,
        }),
        { replace: true },
      );
      return;
    }
    const token = ++expandAnimTokenRef.current;
    pendingWorkspaceFadeInRef.current = false;
    pendingListFadeInRef.current = true;
    setWorkspaceFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setListFaded(true);
      navigate(
        getContactOverlayHref(selectedSlugValue, {
          section: cardSection === "overview" ? undefined : cardSection,
          layout: "panel",
          groupId: effectiveGroupId,
        }),
        { replace: true },
      );
    }, CONTACT_DETAIL_EXPAND_FADE_MS);
  }, [
    cardSection,
    navigate,
    overlayLayout,
    selectedGroupId,
    selectedSlugValue,
    workspaceDetail,
  ]);

  // After expand navigates to page: fade workspace in.
  useLayoutEffect(() => {
    if (overlayLayout !== "page") return;
    if (!pendingWorkspaceFadeInRef.current) {
      setListFaded(true);
      return;
    }
    pendingWorkspaceFadeInRef.current = false;
    setWorkspaceFaded(true);
    setListFaded(true);
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

  // After collapse navigates to panel: fade list back in.
  // Direct leave from page (breadcrumb / Escape) skips the pending flag — still
  // restore the catalog so it is not left at opacity 0.
  useLayoutEffect(() => {
    if (overlayLayout !== "panel") return;
    if (!pendingListFadeInRef.current) {
      if (!selected) {
        setListFaded(false);
        setWorkspaceFaded(false);
      }
      return;
    }
    pendingListFadeInRef.current = false;
    setListFaded(true);
    setWorkspaceFaded(false);
    const token = expandAnimTokenRef.current;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (expandAnimTokenRef.current !== token) return;
        setListFaded(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [overlayLayout, selected]);

  useEffect(() => {
    return () => {
      if (expandAnimTimerRef.current != null) {
        window.clearTimeout(expandAnimTimerRef.current);
      }
    };
  }, []);

  const beginDetailCollapseAnimation = useCallback((apply: () => void) => {
    setDetailCollapseAnimating(true);
    if (detailCollapseAnimTimerRef.current != null) {
      window.clearTimeout(detailCollapseAnimTimerRef.current);
      detailCollapseAnimTimerRef.current = null;
    }
    if (detailCollapseRafRef.current != null) {
      window.cancelAnimationFrame(detailCollapseRafRef.current);
      detailCollapseRafRef.current = null;
    }
    // Enable transition for one paint, then flip collapsed so width interpolates.
    detailCollapseRafRef.current = window.requestAnimationFrame(() => {
      detailCollapseRafRef.current = window.requestAnimationFrame(() => {
        detailCollapseRafRef.current = null;
        apply();
        detailCollapseAnimTimerRef.current = window.setTimeout(() => {
          detailCollapseAnimTimerRef.current = null;
          setDetailCollapseAnimating(false);
        }, CONTACT_DETAIL_COLLAPSE_DURATION_MS);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (detailCollapseAnimTimerRef.current != null) {
        window.clearTimeout(detailCollapseAnimTimerRef.current);
      }
      if (detailCollapseRafRef.current != null) {
        window.cancelAnimationFrame(detailCollapseRafRef.current);
      }
      if (detailCloseNavTimerRef.current != null) {
        window.clearTimeout(detailCloseNavTimerRef.current);
      }
    };
  }, []);

  const hideDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
  }, [beginDetailCollapseAnimation]);

  const showDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(false);
    });
  }, [beginDetailCollapseAnimation]);

  const closeOverlay = useCallback(() => {
    if (detailCloseNavTimerRef.current != null) {
      window.clearTimeout(detailCloseNavTimerRef.current);
      detailCloseNavTimerRef.current = null;
    }

    const leave = () => {
      expandAnimTokenRef.current += 1;
      pendingListFadeInRef.current = false;
      pendingWorkspaceFadeInRef.current = false;
      if (expandAnimTimerRef.current != null) {
        window.clearTimeout(expandAnimTimerRef.current);
        expandAnimTimerRef.current = null;
      }
      setListFaded(false);
      setWorkspaceFaded(false);
      setDetailCollapsed(false);
      navigate(getContactsGroupHref(effectiveGroupId), { replace: true });
    };

    // Already on the reopen strip — leave immediately.
    if (detailCollapsedRef.current) {
      leave();
      return;
    }

    // Slide closed, then navigate so Escape matches `]` hide animation.
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
    detailCloseNavTimerRef.current = window.setTimeout(() => {
      detailCloseNavTimerRef.current = null;
      leave();
    }, CONTACT_DETAIL_COLLAPSE_DURATION_MS);
  }, [beginDetailCollapseAnimation, navigate, selectedGroupId]);

  // Selecting a contact while the reopen strip is showing should NOT slide
  // the panel open — stay collapsed. First open (no prior selection) uses the
  // overlay enter slide; switching while expanded fades card content.
  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selected?.id ?? null;

    if (!selected?.id) {
      setDetailCollapsed(false);
      return;
    }
    // Switching contacts while the strip is showing: keep the strip.
    if (detailCollapsed && prevId != null) return;
  }, [selected?.id, detailCollapsed]);

  // Opacity crossfade when switching contacts while the panel is open.
  // useLayoutEffect so fade-out starts before paint (no flash of new chrome).
  useLayoutEffect(() => {
    const nextId = selected?.id ?? null;
    if (nextId === panelContactId) return;

    // Route can briefly miss a match while keep-alive href flips — keep the
    // current card mounted so we don't abort mid-fade / remount the rail.
    if (nextId == null) return;

    const canFade =
      panelContactId != null &&
      !detailCollapsed &&
      !detailCollapseAnimating;

    if (!canFade) {
      contentFadeTokenRef.current += 1;
      setPanelContactId(nextId);
      setContentFaded(false);
      return;
    }

    const token = ++contentFadeTokenRef.current;
    setContentFaded(true);
    const timer = window.setTimeout(() => {
      if (contentFadeTokenRef.current !== token) return;
      setPanelContactId(nextId);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (contentFadeTokenRef.current !== token) return;
          setContentFaded(false);
        });
      });
    }, CONTACT_DETAIL_CONTENT_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [
    detailCollapseAnimating,
    detailCollapsed,
    panelContactId,
    selected?.id,
  ]);

  const panelContact =
    panelContactId == null
      ? null
      : (contacts.find((entry) => entry.id === panelContactId) ??
        (selected?.id === panelContactId ? selected : null));

  // Close the panel only when the route truly leaves contacts (no slug).
  useLayoutEffect(() => {
    if (routedSlug) return;
    contentFadeTokenRef.current += 1;
    expandAnimTokenRef.current += 1;
    pendingListFadeInRef.current = false;
    pendingWorkspaceFadeInRef.current = false;
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
      expandAnimTimerRef.current = null;
    }
    setPanelContactId(null);
    setContentFaded(false);
    setListFaded(false);
    setWorkspaceFaded(false);
    setDetailCollapsed(false);
  }, [routedSlug]);

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
          const tab = CONTACT_EXPANDED_WORKSPACE_TAB_IDS[tabIndex];
          if (tab) {
            if (!shouldHandleGlobalShortcut(event)) return;
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
      beginDetailCollapseAnimation(() => {
        setDetailCollapsed((current) => !current);
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    beginDetailCollapseAnimation,
    closeOverlay,
    collapseOverlay,
    isStandalone,
    keepAliveActive,
    navigate,
    overlayLayout,
    selected,
    selectedGroupId,
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
          settings={contact.portalSettings}
          portalUsername={contact.portalUsername}
          portalPasswordSet={Boolean(contact.portalPasswordSet)}
          projects={portalProjects}
          emails={getContactEmailAddresses({
            email: details?.email ?? contact.email,
            emails: details?.emails ?? contact.emails,
          }).map((address) => ({ address }))}
          error={portalSaveError}
          onSave={async ({ settings, portalUsername, portalPassword }) => {
            setPortalSaveError(null);
            try {
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
        />
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
          breadcrumbItems={contactWorkspaceBreadcrumbPrefix("Emails", backHref)}
        />
      );
    }

    return null;
  }

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
          latitude: contactLatitude,
          longitude: contactLongitude,
          organizationId: contact.organizationId ?? details?.organizationId,
          organizationName: contact.organizationName,
          summary: details?.summary ?? null,
          socialAccounts: normalizeContactSocialAccounts(
            details?.socialAccounts,
          ),
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
        onMore={isStandalone ? expandOverlay : undefined}
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
        onCreateOrganizationFromQuery={(query) => {
          void workspace.createOrganization({ name: query }).then((created) => {
            void workspace.patchContact(contact.id, {
              organizationId: created.id,
            });
          });
        }}
        overviewHeaderAccessory={
          <AvatarUpload
            displayName={contact.name}
            avatarSrc={avatarSrc}
            showHint={false}
            onUpload={async (file) => {
              const result = await uploadDesktopAvatar(
                client,
                "contact",
                contact.id,
                file,
              );
              if (result.ok) {
                const url = URL.createObjectURL(file);
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return url;
                });
              }
              return result;
            }}
            onRemove={async () => {
              const result = await removeDesktopAvatar(
                client,
                "contact",
                contact.id,
              );
              if (result.ok) {
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return null;
                });
              }
              return result;
            }}
          />
        }
        onSaveFirstName={async (firstName) => {
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
        }}
        onSaveLastName={async (lastName) => {
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
        }}
        onSaveDetails={(patch: ContactOverviewDetails) => {
          void workspace.patchContact(contact.id, patch);
        }}
        onAfterLocationSave={(parts) => {
          void resolveContactLocation(contact.id, parts);
        }}
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
        hideWorkspaceTabs={Boolean(workspaceDetail)}
        workspaceTab={workspaceTab}
        onWorkspaceTabChange={(tab) => {
          setWorkspaceTab(tab);
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
          if (workspaceDetail) {
            return renderWorkspaceEntityDetail(workspaceDetail);
          }
          if (tab === "meetings" && selected) {
            return (
              <ContactMeetingsListView
                contactId={selected.id}
                meetings={meetings}
                onSelectMeeting={(meetingId) => {
                  if (!selectedSlugValue) return;
                  navigate(
                    getScopedContactMeetingHref(
                      selectedSlugValue,
                      meetingId,
                      routeScope,
                    ),
                  );
                }}
              />
            );
          }
          if (tab === "emails" && selected) {
            return (
              <ContactEmailsListView
                contactId={selected.id}
                contactEmail={details?.email ?? selected.email}
                contactEmails={normalizeContactEmails(
                  details?.emails ?? selected.emails,
                )}
                emails={keepAliveFrozen ? [] : agentMail.messages}
                onSelectEmail={(email) => {
                  if (!selectedSlugValue) return;
                  navigate(
                    getScopedContactEmailHref(
                      selectedSlugValue,
                      email,
                      routeScope,
                    ),
                  );
                }}
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
